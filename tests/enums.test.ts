import { $Enums } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  CASE_STATUSES,
  DOCUMENT_CATEGORIES,
  RECOMMENDATIONS,
  REVIEW_REASONS,
  RISK_LEVELS,
  ROLES,
} from "@/lib/kyc/types";

const sorted = (v: readonly string[]) => [...v].sort();

describe("client-side enum constants match the database enums", () => {
  it.each([
    ["CaseStatus", CASE_STATUSES, $Enums.CaseStatus],
    ["RiskLevel", RISK_LEVELS, $Enums.RiskLevel],
    ["ReviewReason", REVIEW_REASONS, $Enums.ReviewReason],
    ["DocumentCategory", DOCUMENT_CATEGORIES, $Enums.DocumentCategory],
    ["Recommendation", RECOMMENDATIONS, $Enums.Recommendation],
    ["AuditAction", AUDIT_ACTIONS, $Enums.AuditAction],
  ] as const)("%s", (_name, local, prisma) => {
    expect(sorted(local)).toEqual(sorted(Object.values(prisma)));
  });

  it("human roles are the database roles minus SYSTEM", () => {
    expect(sorted(ROLES)).toEqual(sorted(Object.values($Enums.Role).filter((r) => r !== "SYSTEM")));
  });
});
