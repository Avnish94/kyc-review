import { canPerformAction, type Actor } from "@/lib/authz";
import { missingEvidence, type RuleSetConfig } from "@/lib/rules/config";
import {
  ACTION_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  STATUS_LABELS,
  type CaseAction,
  type CaseStatus,
  type DocumentCategory,
  type Recommendation,
  type ReviewReason,
  type RiskLevel,
} from "@/lib/kyc/types";

type TransitionRule = { from: readonly CaseStatus[]; to: CaseStatus };

/** Base state machine. Four-eyes rules further restrict APPROVE/REJECT/SUBMIT (see isActionAvailable). */
export const TRANSITIONS: Record<CaseAction, TransitionRule> = {
  APPROVE: { from: ["PENDING_REVIEW", "PENDING_APPROVAL"], to: "APPROVED" },
  REJECT: { from: ["PENDING_REVIEW", "INFO_REQUESTED", "PENDING_APPROVAL"], to: "REJECTED" },
  REQUEST_INFO: { from: ["PENDING_REVIEW"], to: "INFO_REQUESTED" },
  MARK_INFO_RECEIVED: { from: ["INFO_REQUESTED"], to: "PENDING_REVIEW" },
  SUBMIT_FOR_APPROVAL: { from: ["PENDING_REVIEW"], to: "PENDING_APPROVAL" },
  SEND_BACK: { from: ["PENDING_APPROVAL"], to: "PENDING_REVIEW" },
  REOPEN: { from: ["APPROVED", "REJECTED"], to: "PENDING_REVIEW" },
};

export const MAX_NOTE_LENGTH = 1000;

export type WorkflowCase = {
  status: CaseStatus;
  riskLevel: RiskLevel;
  reviewReason: ReviewReason;
  assigneeId: string | null;
  submittedById: string | null;
  documentCategories: readonly DocumentCategory[];
};

export type WorkflowErrorCode =
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "NOTE_REQUIRED"
  | "NOTE_TOO_LONG"
  | "RECOMMENDATION_REQUIRED"
  | "EVIDENCE_MISSING";

export type WorkflowResult =
  | { ok: true; toStatus: CaseStatus; note: string | null; recommendation: Recommendation | null }
  | { ok: false; code: WorkflowErrorCode; message: string };

function requiresFourEyes(riskLevel: RiskLevel, rules: RuleSetConfig): boolean {
  return rules.fourEyesRiskLevels.includes(riskLevel);
}

/** Whether the action is a valid transition for this case under the rule set (ignores who is acting). */
export function isActionAvailable(
  kycCase: Pick<WorkflowCase, "status" | "riskLevel">,
  action: CaseAction,
  rules: RuleSetConfig,
): boolean {
  if (!TRANSITIONS[action].from.includes(kycCase.status)) return false;
  const fourEyes = requiresFourEyes(kycCase.riskLevel, rules);
  if (action === "SUBMIT_FOR_APPROVAL") return fourEyes;
  if ((action === "APPROVE" || action === "REJECT") && kycCase.status !== "PENDING_APPROVAL") return !fourEyes;
  return true;
}

export function availableActions(kycCase: Pick<WorkflowCase, "status" | "riskLevel">, rules: RuleSetConfig): CaseAction[] {
  return (Object.keys(TRANSITIONS) as CaseAction[]).filter((a) => isActionAvailable(kycCase, a, rules));
}

const describe = (s: string) => s.toLowerCase();

/**
 * Pure decision function: validates the transition, the actor's permission, the note, the
 * recommendation and required evidence. No side effects, so the UI, service, seed and tests share it.
 */
export function evaluateAction(input: {
  kycCase: WorkflowCase;
  action: CaseAction;
  actor: Actor;
  rules: RuleSetConfig;
  note?: string | null;
  recommendation?: Recommendation | null;
}): WorkflowResult {
  const { kycCase, action, actor, rules } = input;

  if (!isActionAvailable(kycCase, action, rules)) {
    const fourEyesHint =
      (action === "APPROVE" || action === "REJECT") &&
      TRANSITIONS[action].from.includes(kycCase.status) &&
      requiresFourEyes(kycCase.riskLevel, rules)
        ? " This risk level needs four-eyes approval: submit it for approval instead."
        : "";
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `Cannot ${describe(ACTION_LABELS[action])} a case that is ${describe(STATUS_LABELS[kycCase.status])}.${fourEyesHint}`,
    };
  }

  const authz = canPerformAction(actor, action, kycCase, rules);
  if (!authz.allowed) return { ok: false, code: "FORBIDDEN", message: authz.reason };

  const recommendation = action === "SUBMIT_FOR_APPROVAL" ? (input.recommendation ?? null) : null;
  if (action === "SUBMIT_FOR_APPROVAL" && !recommendation) {
    return { ok: false, code: "RECOMMENDATION_REQUIRED", message: "Choose a recommendation before submitting." };
  }

  const note = input.note?.trim() || null;
  if (rules.notesRequired[action] && !note) {
    return { ok: false, code: "NOTE_REQUIRED", message: "A note is required for this action." };
  }
  if (note && note.length > MAX_NOTE_LENGTH) {
    return { ok: false, code: "NOTE_TOO_LONG", message: `Notes must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  }

  const approving = action === "APPROVE" || recommendation === "APPROVE";
  if (approving && rules.requireEvidenceToApprove) {
    const missing = missingEvidence(rules, kycCase.reviewReason, kycCase.documentCategories);
    if (missing.length > 0) {
      return {
        ok: false,
        code: "EVIDENCE_MISSING",
        message: `Upload the required evidence first: ${missing.map((c) => DOCUMENT_CATEGORY_LABELS[c]).join(", ")}.`,
      };
    }
  }

  return { ok: true, toStatus: TRANSITIONS[action].to, note, recommendation };
}
