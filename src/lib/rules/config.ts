import { z } from "zod";
import {
  CASE_ACTIONS,
  DOCUMENT_CATEGORIES,
  REVIEW_REASONS,
  RISK_LEVELS,
  type DocumentCategory,
  type ReviewReason,
} from "@/lib/kyc/types";

const riskLevel = z.enum(RISK_LEVELS);
const uniqueRiskLevels = z.array(riskLevel).transform((levels) => RISK_LEVELS.filter((l) => levels.includes(l)));

export const ruleSetConfigSchema = z
  .object({
    /** Score at or above which a new case is classified as MEDIUM / HIGH risk. */
    riskThresholds: z.object({
      medium: z.number().int().min(1).max(99),
      high: z.number().int().min(2).max(100),
    }),
    /** Risk levels an Analyst may decide alone (Admins may decide any level not requiring four-eyes). */
    analystDecisionRiskLevels: uniqueRiskLevels,
    /** Risk levels that must be prepared by one user and approved by a different Admin. */
    fourEyesRiskLevels: uniqueRiskLevels,
    notesRequired: z.record(z.enum(CASE_ACTIONS), z.boolean()),
    /** Hours from case creation (or reopening) until the review is due. */
    slaHours: z.record(riskLevel, z.number().int().min(1).max(24 * 90)),
    requiredEvidence: z.record(z.enum(REVIEW_REASONS), z.array(z.enum(DOCUMENT_CATEGORIES))),
    /** When true, a case cannot be approved until every required evidence category is uploaded. */
    requireEvidenceToApprove: z.boolean(),
  })
  .refine((c) => c.riskThresholds.high > c.riskThresholds.medium, {
    message: "The high-risk threshold must be greater than the medium-risk threshold.",
    path: ["riskThresholds", "high"],
  });

export type RuleSetConfig = z.infer<typeof ruleSetConfigSchema>;

export type ActiveRules = { version: number; config: RuleSetConfig };

export const DEFAULT_RULES: RuleSetConfig = {
  riskThresholds: { medium: 40, high: 70 },
  analystDecisionRiskLevels: ["LOW", "MEDIUM"],
  fourEyesRiskLevels: ["HIGH"],
  notesRequired: {
    APPROVE: false,
    REJECT: true,
    REQUEST_INFO: true,
    MARK_INFO_RECEIVED: false,
    SUBMIT_FOR_APPROVAL: true,
    SEND_BACK: true,
    REOPEN: true,
  },
  slaHours: { LOW: 120, MEDIUM: 72, HIGH: 24 },
  requiredEvidence: {
    PEP_MATCH: ["IDENTITY", "SOURCE_OF_FUNDS"],
    SANCTIONS_NEAR_MATCH: ["IDENTITY", "SCREENING_DISPOSITION"],
    ADVERSE_MEDIA: ["SCREENING_DISPOSITION"],
    DOCUMENT_MISMATCH: ["IDENTITY", "PROOF_OF_ADDRESS"],
    HIGH_RISK_JURISDICTION: ["PROOF_OF_ADDRESS", "SOURCE_OF_FUNDS"],
    UNUSUAL_VOLUME: ["SOURCE_OF_FUNDS"],
    PERIODIC_REFRESH: [],
  },
  requireEvidenceToApprove: true,
};

export function missingEvidence(
  config: RuleSetConfig,
  reason: ReviewReason,
  uploaded: readonly DocumentCategory[],
): DocumentCategory[] {
  return config.requiredEvidence[reason].filter((c) => !uploaded.includes(c));
}

export function dueDateFor(config: RuleSetConfig, riskLevel: (typeof RISK_LEVELS)[number], from: Date): Date {
  return new Date(from.getTime() + config.slaHours[riskLevel] * 3_600_000);
}
