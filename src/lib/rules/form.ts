import {
  CASE_ACTIONS,
  DOCUMENT_CATEGORIES,
  REVIEW_REASONS,
  RISK_LEVELS,
} from "@/lib/kyc/types";
import { ruleSetConfigSchema, type RuleSetConfig } from "@/lib/rules/config";

export type ParseRulesResult = { ok: true; config: RuleSetConfig } | { ok: false; errors: string[] };

const int = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Converts the rules editor form into a validated rule set config. */
export function parseRulesForm(fd: FormData): ParseRulesResult {
  const raw = {
    riskThresholds: { medium: int(fd.get("threshold.medium")), high: int(fd.get("threshold.high")) },
    analystDecisionRiskLevels: RISK_LEVELS.filter((l) => fd.get(`analyst.${l}`) === "on"),
    fourEyesRiskLevels: RISK_LEVELS.filter((l) => fd.get(`fourEyes.${l}`) === "on"),
    notesRequired: Object.fromEntries(CASE_ACTIONS.map((a) => [a, fd.get(`note.${a}`) === "on"])),
    slaHours: Object.fromEntries(RISK_LEVELS.map((l) => [l, int(fd.get(`sla.${l}`))])),
    requiredEvidence: Object.fromEntries(
      REVIEW_REASONS.map((r) => [r, DOCUMENT_CATEGORIES.filter((c) => fd.get(`evidence.${r}.${c}`) === "on")]),
    ),
    requireEvidenceToApprove: fd.get("requireEvidenceToApprove") === "on",
  };
  const parsed = ruleSetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, config: parsed.data };
}
