import type { RuleSetConfig } from "@/lib/rules/config";
import { RISK_LABELS, isOpenStatus, type CaseAction, type CaseStatus, type RiskLevel, type Role } from "@/lib/kyc/types";

export type AuthzResult = { allowed: true } | { allowed: false; reason: string };

export type Actor = { id: string; role: Role };

export type AuthzCase = {
  status: CaseStatus;
  riskLevel: RiskLevel;
  assigneeId: string | null;
  submittedById: string | null;
};

const ALLOW: AuthzResult = { allowed: true };
const deny = (reason: string): AuthzResult => ({ allowed: false, reason });

/**
 * Central authorization policy for workflow actions. Transition validity is checked separately
 * in workflow.ts; this only answers "may this person do this to this case?".
 *
 * - Approval-stage decisions (from PENDING_APPROVAL) need an Admin who did not submit the case.
 * - Other work on an open case needs the case to be assigned to the actor (Admins may override).
 * - Analysts may only decide risk levels listed in the active rule set.
 * - Reopening a decided case is Admin-only.
 */
export function canPerformAction(actor: Actor, action: CaseAction, kycCase: AuthzCase, rules: RuleSetConfig): AuthzResult {
  if (action === "REOPEN") {
    return actor.role === "ADMIN" ? ALLOW : deny("Only Admins can reopen a decided case.");
  }

  if (kycCase.status === "PENDING_APPROVAL") {
    if (actor.role !== "ADMIN") return deny("Only an Admin can act on a case awaiting approval.");
    if (kycCase.submittedById === actor.id) {
      return deny("Four-eyes rule: you submitted this case, so a different Admin must decide it.");
    }
    return ALLOW;
  }

  if (actor.role !== "ADMIN" && kycCase.assigneeId !== actor.id) {
    return deny(kycCase.assigneeId ? "This case is assigned to someone else." : "Assign this case to yourself first.");
  }

  if ((action === "APPROVE" || action === "REJECT") && actor.role === "ANALYST") {
    if (!rules.analystDecisionRiskLevels.includes(kycCase.riskLevel)) {
      return deny(`${RISK_LABELS[kycCase.riskLevel]}-risk decisions require an Admin.`);
    }
  }

  return ALLOW;
}

export type AssignmentCase = { status: CaseStatus; assigneeId: string | null };

/** Who may change a case's assignee. `assigneeId` null means unassign. */
export function canAssign(actor: Actor, kycCase: AssignmentCase, assigneeId: string | null): AuthzResult {
  if (!isOpenStatus(kycCase.status)) return deny("Decided cases cannot be reassigned.");
  if (actor.role === "ADMIN") return ALLOW;
  if (assigneeId === null) {
    return kycCase.assigneeId === actor.id ? ALLOW : deny("Only the assignee or an Admin can unassign this case.");
  }
  if (assigneeId !== actor.id) return deny("Only Admins can assign cases to other people.");
  if (kycCase.assigneeId && kycCase.assigneeId !== actor.id) return deny("This case is already assigned to someone else.");
  return ALLOW;
}

export function canManageRules(role: Role): boolean {
  return role === "ADMIN";
}

export function canExportData(role: Role): boolean {
  return role === "ADMIN";
}
