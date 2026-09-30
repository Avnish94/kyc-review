export const ROLES = ["ANALYST", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CASE_STATUSES = ["PENDING_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CASE_ACTIONS = [
  "APPROVE",
  "REJECT",
  "REQUEST_INFO",
  "MARK_INFO_RECEIVED",
  "REOPEN",
] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

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

export const ROLE_LABELS: Record<Role | "SYSTEM", string> = {
  ANALYST: "Analyst",
  ADMIN: "Admin",
  SYSTEM: "System",
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  PENDING_REVIEW: "Pending review",
  INFO_REQUESTED: "Info requested",
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
  REOPEN: "Reopen case",
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

export const AUDIT_ACTION_LABELS: Record<CaseAction | "CASE_CREATED", string> = {
  ...ACTION_LABELS,
  CASE_CREATED: "Case created",
};

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export const isRole = (v: unknown): v is Role => isOneOf(ROLES, v);
export const isCaseStatus = (v: unknown): v is CaseStatus => isOneOf(CASE_STATUSES, v);
export const isRiskLevel = (v: unknown): v is RiskLevel => isOneOf(RISK_LEVELS, v);
export const isCaseAction = (v: unknown): v is CaseAction => isOneOf(CASE_ACTIONS, v);
export const isReviewReason = (v: unknown): v is ReviewReason => isOneOf(REVIEW_REASONS, v);
