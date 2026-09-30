import { canPerformAction } from "@/lib/authz";
import type { CaseAction, CaseStatus, RiskLevel, Role } from "@/lib/kyc/types";

type TransitionRule = {
  from: readonly CaseStatus[];
  to: CaseStatus;
  noteRequired: boolean;
};

export const TRANSITIONS: Record<CaseAction, TransitionRule> = {
  APPROVE: { from: ["PENDING_REVIEW"], to: "APPROVED", noteRequired: false },
  REJECT: { from: ["PENDING_REVIEW", "INFO_REQUESTED"], to: "REJECTED", noteRequired: true },
  REQUEST_INFO: { from: ["PENDING_REVIEW"], to: "INFO_REQUESTED", noteRequired: true },
  MARK_INFO_RECEIVED: { from: ["INFO_REQUESTED"], to: "PENDING_REVIEW", noteRequired: false },
  REOPEN: { from: ["APPROVED", "REJECTED"], to: "PENDING_REVIEW", noteRequired: true },
};

export const MAX_NOTE_LENGTH = 1000;

export type WorkflowErrorCode = "INVALID_TRANSITION" | "FORBIDDEN" | "NOTE_REQUIRED" | "NOTE_TOO_LONG";

export type WorkflowResult =
  | { ok: true; toStatus: CaseStatus; note: string | null }
  | { ok: false; code: WorkflowErrorCode; message: string };

export type WorkflowCase = { status: CaseStatus; riskLevel: RiskLevel };

/** Actions whose transition is valid from the given status (ignores permissions). */
export function actionsForStatus(status: CaseStatus): CaseAction[] {
  return (Object.keys(TRANSITIONS) as CaseAction[]).filter((action) =>
    TRANSITIONS[action].from.includes(status),
  );
}

/**
 * Pure decision function: validates the transition, the actor's permission and the note.
 * Has no side effects so it can be reused by the UI, the service layer, the seed and tests.
 */
export function evaluateAction(
  kycCase: WorkflowCase,
  action: CaseAction,
  role: Role,
  rawNote?: string | null,
): WorkflowResult {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(kycCase.status)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Cannot ${action.toLowerCase().replace(/_/g, " ")} a case that is ${kycCase.status.toLowerCase().replace(/_/g, " ")}.`,
    };
  }

  const authz = canPerformAction(role, action, kycCase.riskLevel);
  if (!authz.allowed) {
    return { ok: false, code: "FORBIDDEN", message: authz.reason };
  }

  const note = rawNote?.trim() || null;
  if (rule.noteRequired && !note) {
    return { ok: false, code: "NOTE_REQUIRED", message: "A note is required for this action." };
  }
  if (note && note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      code: "NOTE_TOO_LONG",
      message: `Notes must be ${MAX_NOTE_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, toStatus: rule.to, note };
}
