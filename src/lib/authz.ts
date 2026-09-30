import type { CaseAction, RiskLevel, Role } from "@/lib/kyc/types";

export type AuthzResult = { allowed: true } | { allowed: false; reason: string };

const ALLOW: AuthzResult = { allowed: true };

/**
 * Central role-based authorization policy for case actions.
 * - Analysts may request info and decide LOW/MEDIUM risk cases.
 * - HIGH risk decisions and reopening decided cases require an Admin.
 */
export function canPerformAction(role: Role, action: CaseAction, riskLevel: RiskLevel): AuthzResult {
  switch (action) {
    case "REQUEST_INFO":
    case "MARK_INFO_RECEIVED":
      return ALLOW;
    case "APPROVE":
    case "REJECT":
      if (riskLevel === "HIGH" && role !== "ADMIN") {
        return { allowed: false, reason: "High-risk decisions require an Admin." };
      }
      return ALLOW;
    case "REOPEN":
      if (role !== "ADMIN") {
        return { allowed: false, reason: "Only Admins can reopen a decided case." };
      }
      return ALLOW;
  }
}
