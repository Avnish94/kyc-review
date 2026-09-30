import type { PrismaClient } from "@prisma/client";
import { evaluateAction, type WorkflowErrorCode } from "@/lib/kyc/workflow";
import { isCaseStatus, isRiskLevel, type CaseAction, type CaseStatus, type Role } from "@/lib/kyc/types";

export type Actor = { id: string; role: Role };

export type PerformActionInput = {
  caseId: string;
  action: CaseAction;
  note?: string | null;
  /** Status the user saw when submitting; guards against acting on stale data. */
  expectedStatus: CaseStatus;
  actor: Actor;
};

export type PerformActionResult =
  | { ok: true; toStatus: CaseStatus }
  | { ok: false; code: WorkflowErrorCode | "NOT_FOUND" | "CONFLICT"; message: string };

/**
 * Applies a status-changing action to a case. The status update and its audit record
 * are written in one transaction so a case never changes state without an audit trail.
 */
export async function performCaseAction(
  db: PrismaClient,
  input: PerformActionInput,
): Promise<PerformActionResult> {
  return db.$transaction(async (tx) => {
    const kycCase = await tx.kycCase.findUnique({
      where: { id: input.caseId },
      select: { id: true, status: true, riskLevel: true },
    });
    if (!kycCase || !isCaseStatus(kycCase.status) || !isRiskLevel(kycCase.riskLevel)) {
      return { ok: false, code: "NOT_FOUND", message: "Case not found." };
    }

    if (kycCase.status !== input.expectedStatus) {
      return {
        ok: false,
        code: "CONFLICT",
        message: "This case was updated by someone else. Refresh to see the latest status.",
      };
    }

    const decision = evaluateAction(
      { status: kycCase.status, riskLevel: kycCase.riskLevel },
      input.action,
      input.actor.role,
      input.note,
    );
    if (!decision.ok) return decision;

    const { count } = await tx.kycCase.updateMany({
      where: { id: kycCase.id, status: kycCase.status },
      data: { status: decision.toStatus },
    });
    if (count !== 1) {
      return {
        ok: false,
        code: "CONFLICT",
        message: "This case was updated by someone else. Refresh to see the latest status.",
      };
    }

    await tx.auditEvent.create({
      data: {
        caseId: kycCase.id,
        actorId: input.actor.id,
        action: input.action,
        fromStatus: kycCase.status,
        toStatus: decision.toStatus,
        note: decision.note,
      },
    });

    return { ok: true, toStatus: decision.toStatus };
  });
}
