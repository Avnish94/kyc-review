import type { Prisma, PrismaClient } from "@prisma/client";
import { canAssign, type Actor } from "@/lib/authz";
import { activeAdminIds, appUrl, enqueueTeamsMessage, notifyUsers } from "@/lib/notifications";
import { dueDateFor } from "@/lib/rules/config";
import { getActiveRules } from "@/lib/rules/store";
import { evaluateAction, type WorkflowErrorCode } from "@/lib/kyc/workflow";
import {
  ACTION_LABELS,
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
  type CaseAction,
  type CaseStatus,
  type Recommendation,
} from "@/lib/kyc/types";

export type { Actor };

export type PerformActionInput = {
  caseId: string;
  action: CaseAction;
  note?: string | null;
  recommendation?: Recommendation | null;
  /** Status the user saw when submitting; guards against acting on stale data. */
  expectedStatus: CaseStatus;
  actor: Actor;
};

export type ServiceErrorCode = WorkflowErrorCode | "NOT_FOUND" | "CONFLICT";

export type PerformActionResult =
  | { ok: true; toStatus: CaseStatus }
  | { ok: false; code: ServiceErrorCode; message: string };

const CONFLICT = {
  ok: false,
  code: "CONFLICT",
  message: "This case was updated by someone else. Refresh to see the latest status.",
} as const;

/**
 * Applies a status-changing action. The status update, its audit record and any notifications
 * are written in one transaction so a case never changes state without an audit trail.
 */
export async function performCaseAction(db: PrismaClient, input: PerformActionInput): Promise<PerformActionResult> {
  return db.$transaction(async (tx) => {
    const kycCase = await tx.kycCase.findUnique({
      where: { id: input.caseId },
      include: { documents: { select: { category: true } } },
    });
    if (!kycCase) return { ok: false, code: "NOT_FOUND", message: "Case not found." };
    if (kycCase.status !== input.expectedStatus) return CONFLICT;

    const rules = await getActiveRules(tx);
    const decision = evaluateAction({
      kycCase: { ...kycCase, documentCategories: kycCase.documents.map((d) => d.category) },
      action: input.action,
      actor: input.actor,
      rules: rules.config,
      note: input.note,
      recommendation: input.recommendation,
    });
    if (!decision.ok) return decision;

    const now = new Date();
    const leavingApproval = kycCase.status === "PENDING_APPROVAL";
    const data: Prisma.KycCaseUncheckedUpdateManyInput = { status: decision.toStatus };
    if (input.action === "SUBMIT_FOR_APPROVAL") {
      data.submittedById = input.actor.id;
      data.recommendation = decision.recommendation;
    } else if (leavingApproval) {
      data.submittedById = null;
      data.recommendation = null;
    }
    if (input.action === "APPROVE" || input.action === "REJECT") data.decidedAt = now;
    if (input.action === "REOPEN") {
      data.decidedAt = null;
      data.dueAt = dueDateFor(rules.config, kycCase.riskLevel, now);
    }

    const { count } = await tx.kycCase.updateMany({ where: { id: kycCase.id, status: kycCase.status }, data });
    if (count !== 1) return CONFLICT;

    await tx.auditEvent.create({
      data: {
        caseId: kycCase.id,
        actorId: input.actor.id,
        action: input.action,
        fromStatus: kycCase.status,
        toStatus: decision.toStatus,
        note: decision.note,
        ruleSetVersion: rules.version,
        ...(decision.recommendation && { metadata: { recommendation: decision.recommendation } }),
      },
    });

    const caseUrl = appUrl(`/cases/${kycCase.id}`);
    if (input.action === "SUBMIT_FOR_APPROVAL" && decision.recommendation) {
      const title = `${kycCase.caseRef} awaiting approval`;
      const body = `${RECOMMENDATION_LABELS[decision.recommendation]} for ${kycCase.customerName} (${kycCase.riskLevel.toLowerCase()} risk).`;
      await notifyUsers(tx, { userIds: await activeAdminIds(tx, input.actor.id), caseId: kycCase.id, title, body });
      await enqueueTeamsMessage(tx, { title, text: body, url: caseUrl });
    } else if (leavingApproval && kycCase.submittedById && kycCase.submittedById !== input.actor.id) {
      await notifyUsers(tx, {
        userIds: [kycCase.submittedById],
        caseId: kycCase.id,
        title: `${kycCase.caseRef}: ${ACTION_LABELS[input.action].toLowerCase()}`,
        body: `Your submission for ${kycCase.customerName} is now “${STATUS_LABELS[decision.toStatus]}”.`,
      });
    } else if (input.action === "REOPEN" && kycCase.assigneeId && kycCase.assigneeId !== input.actor.id) {
      await notifyUsers(tx, {
        userIds: [kycCase.assigneeId],
        caseId: kycCase.id,
        title: `${kycCase.caseRef} reopened`,
        body: `${kycCase.customerName} is back in review.`,
      });
    }

    return { ok: true, toStatus: decision.toStatus };
  });
}

export type AssignResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_ASSIGNEE"; message: string };

/** Assigns (or with `assigneeId: null`, unassigns) a case, with an audit record. */
export async function assignCase(
  db: PrismaClient,
  input: { caseId: string; actor: Actor; assigneeId: string | null; expectedAssigneeId: string | null },
): Promise<AssignResult> {
  return db.$transaction(async (tx) => {
    const kycCase = await tx.kycCase.findUnique({ where: { id: input.caseId } });
    if (!kycCase) return { ok: false, code: "NOT_FOUND", message: "Case not found." };
    if (kycCase.assigneeId !== input.expectedAssigneeId) {
      return { ok: false, code: "CONFLICT", message: "The assignee changed since you loaded this case. Refresh and try again." };
    }

    const authz = canAssign(input.actor, kycCase, input.assigneeId);
    if (!authz.allowed) return { ok: false, code: "FORBIDDEN", message: authz.reason };
    if (kycCase.assigneeId === input.assigneeId) return { ok: true };

    const assignee = input.assigneeId
      ? await tx.user.findFirst({
          where: { id: input.assigneeId, active: true, role: { in: ["ANALYST", "ADMIN"] } },
          select: { id: true, name: true },
        })
      : null;
    if (input.assigneeId && !assignee) {
      return { ok: false, code: "INVALID_ASSIGNEE", message: "That user cannot be assigned cases." };
    }

    const { count } = await tx.kycCase.updateMany({
      where: { id: kycCase.id, assigneeId: kycCase.assigneeId },
      data: { assigneeId: input.assigneeId },
    });
    if (count !== 1) return { ok: false, code: "CONFLICT", message: "The case changed. Refresh and try again." };

    const rules = await getActiveRules(tx);
    await tx.auditEvent.create({
      data: {
        caseId: kycCase.id,
        actorId: input.actor.id,
        action: assignee ? "ASSIGN" : "UNASSIGN",
        fromStatus: null,
        toStatus: kycCase.status,
        note: assignee ? `Assigned to ${assignee.name}.` : null,
        ruleSetVersion: rules.version,
        metadata: { fromAssigneeId: kycCase.assigneeId, toAssigneeId: input.assigneeId },
      },
    });

    if (assignee && assignee.id !== input.actor.id) {
      await notifyUsers(tx, {
        userIds: [assignee.id],
        caseId: kycCase.id,
        title: `${kycCase.caseRef} assigned to you`,
        body: `${kycCase.customerName} (${kycCase.riskLevel.toLowerCase()} risk) is now in your queue.`,
      });
    }
    return { ok: true };
  });
}
