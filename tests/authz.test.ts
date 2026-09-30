import { describe, expect, it } from "vitest";
import { canPerformAction } from "@/lib/authz";
import { CASE_ACTIONS, RISK_LEVELS } from "@/lib/kyc/types";

describe("canPerformAction", () => {
  it("allows Admins every action at every risk level", () => {
    for (const action of CASE_ACTIONS) {
      for (const risk of RISK_LEVELS) {
        expect(canPerformAction("ADMIN", action, risk).allowed).toBe(true);
      }
    }
  });

  it.each(["LOW", "MEDIUM"] as const)("lets Analysts approve and reject %s risk cases", (risk) => {
    expect(canPerformAction("ANALYST", "APPROVE", risk).allowed).toBe(true);
    expect(canPerformAction("ANALYST", "REJECT", risk).allowed).toBe(true);
  });

  it("blocks Analysts from deciding HIGH risk cases", () => {
    for (const action of ["APPROVE", "REJECT"] as const) {
      const result = canPerformAction("ANALYST", action, "HIGH");
      expect(result).toEqual({ allowed: false, reason: "High-risk decisions require an Admin." });
    }
  });

  it("lets Analysts request and receive information at any risk level", () => {
    for (const risk of RISK_LEVELS) {
      expect(canPerformAction("ANALYST", "REQUEST_INFO", risk).allowed).toBe(true);
      expect(canPerformAction("ANALYST", "MARK_INFO_RECEIVED", risk).allowed).toBe(true);
    }
  });

  it("only lets Admins reopen decided cases", () => {
    for (const risk of RISK_LEVELS) {
      expect(canPerformAction("ANALYST", "REOPEN", risk).allowed).toBe(false);
    }
  });
});
