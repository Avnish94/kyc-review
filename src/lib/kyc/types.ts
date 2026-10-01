// Client-safe constants mirroring the Prisma enums in prisma/schema.prisma
// (tests/enums.test.ts keeps them in sync).

export const ROLES = ["ANALYST", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CASE_STATUSES = [
  "PENDING_REVIEW",
  "INFO_REQUESTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const OPEN_STATUSES = ["PENDING_REVIEW", "INFO_REQUESTED", "PENDING_APPROVAL"] as const satisfies readonly CaseStatus[];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CASE_ACTIONS = [
  "APPROVE",
  "REJECT",
  "REQUEST_INFO",
  "MARK_INFO_RECEIVED",
  "SUBMIT_FOR_APPROVAL",
  "SEND_BACK",
  "REOPEN",
] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

export const RECOMMENDATIONS = ["APPROVE", "REJECT"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const REVIEW_REASONS = [
  "PEP_MATCH",
  "SANCTIONS_NEAR_MATCH",
  "ADVERSE_MEDIA",
  "DOCUMENT_MISMATCH",
  "HIGH_RISK_JURISDICTION",
  "UNUSUAL_VOLUME",
  "PERIODIC_REFRESH",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const DOCUMENT_CATEGORIES = [
  "IDENTITY",
  "PROOF_OF_ADDRESS",
  "SOURCE_OF_FUNDS",
  "CORPORATE_REGISTRY",
  "OWNERSHIP_STRUCTURE",
  "SCREENING_DISPOSITION",
  "OTHER",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const AUDIT_ACTIONS = [
  "CASE_CREATED",
  ...CASE_ACTIONS,
  "ASSIGN",
  "UNASSIGN",
  "DOCUMENT_UPLOADED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ROLE_LABELS: Record<Role | "SYSTEM", string> = {
  ANALYST: "Analyst",
  ADMIN: "Admin",
  SYSTEM: "System",
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  PENDING_REVIEW: "Pending review",
  INFO_REQUESTED: "Info requested",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const ACTION_LABELS: Record<CaseAction, string> = {
  APPROVE: "Approve",
  REJECT: "Reject",
  REQUEST_INFO: "Request more info",
  MARK_INFO_RECEIVED: "Mark info received",
  SUBMIT_FOR_APPROVAL: "Submit for approval",
  SEND_BACK: "Send back",
  REOPEN: "Reopen case",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  APPROVE: "Recommend approval",
  REJECT: "Recommend rejection",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  PEP_MATCH: "PEP match",
  SANCTIONS_NEAR_MATCH: "Sanctions near-match",
  ADVERSE_MEDIA: "Adverse media",
  DOCUMENT_MISMATCH: "Document mismatch",
  HIGH_RISK_JURISDICTION: "High-risk jurisdiction",
  UNUSUAL_VOLUME: "Unusual transaction volume",
  PERIODIC_REFRESH: "Periodic refresh",
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  IDENTITY: "Identity document",
  PROOF_OF_ADDRESS: "Proof of address",
  SOURCE_OF_FUNDS: "Source of funds",
  CORPORATE_REGISTRY: "Corporate registry extract",
  OWNERSHIP_STRUCTURE: "Ownership structure",
  SCREENING_DISPOSITION: "Screening hit disposition",
  OTHER: "Other",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  ...ACTION_LABELS,
  CASE_CREATED: "Case created",
  ASSIGN: "Assigned",
  UNASSIGN: "Unassigned",
  DOCUMENT_UPLOADED: "Document uploaded",
};

export type RiskThresholds = { medium: number; high: number };

export function riskLevelForScore(score: number, thresholds: RiskThresholds): RiskLevel {
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export const isRole = (v: unknown): v is Role => isOneOf(ROLES, v);
export const isCaseStatus = (v: unknown): v is CaseStatus => isOneOf(CASE_STATUSES, v);
export const isOpenStatus = (v: unknown): boolean => isOneOf(OPEN_STATUSES, v);
export const isRiskLevel = (v: unknown): v is RiskLevel => isOneOf(RISK_LEVELS, v);
export const isCaseAction = (v: unknown): v is CaseAction => isOneOf(CASE_ACTIONS, v);
export const isRecommendation = (v: unknown): v is Recommendation => isOneOf(RECOMMENDATIONS, v);
export const isReviewReason = (v: unknown): v is ReviewReason => isOneOf(REVIEW_REASONS, v);
export const isDocumentCategory = (v: unknown): v is DocumentCategory => isOneOf(DOCUMENT_CATEGORIES, v);
