import { describe, expect, it } from "vitest";
import { actionsForStatus, evaluateAction, MAX_NOTE_LENGTH } from "@/lib/kyc/workflow";
import { CASE_ACTIONS, CASE_STATUSES, type CaseAction, type CaseStatus } from "@/lib/kyc/types";

const VALID: Record<CaseStatus, Partial<Record<CaseAction, CaseStatus>>> = {
  PENDING_REVIEW: { APPROVE: "APPROVED", REJECT: "REJECTED", REQUEST_INFO: "INFO_REQUESTED" },
  INFO_REQUESTED: { MARK_INFO_RECEIVED: "PENDING_REVIEW", REJECT: "REJECTED" },
  APPROVED: { REOPEN: "PENDING_REVIEW" },
  REJECTED: { REOPEN: "PENDING_REVIEW" },
};

describe("evaluateAction transitions", () => {
  for (const status of CASE_STATUSES) {
    for (const action of CASE_ACTIONS) {
      const expected = VALID[status][action];
      it(`${status} + ${action} → ${expected ?? "rejected"}`, () => {
        const result = evaluateAction({ status, riskLevel: "LOW" }, action, "ADMIN", "a note");
        if (expected) {
          expect(result).toMatchObject({ ok: true, toStatus: expected });
        } else {
          expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
        }
      });
    }
  }

  it("actionsForStatus matches the transition table", () => {
    for (const status of CASE_STATUSES) {
      expect(actionsForStatus(status).sort()).toEqual(Object.keys(VALID[status]).sort());
    }
  });

  it("treats APPROVED and REJECTED as terminal except for REOPEN", () => {
    expect(actionsForStatus("APPROVED")).toEqual(["REOPEN"]);
    expect(actionsForStatus("REJECTED")).toEqual(["REOPEN"]);
  });
});

describe("evaluateAction business rules", () => {
  it("requires a note to reject, request info or reopen", () => {
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "LOW" }, "REJECT", "ANALYST", "  ")).toMatchObject({
      ok: false,
      code: "NOTE_REQUIRED",
    });
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "LOW" }, "REQUEST_INFO", "ANALYST")).toMatchObject({
      ok: false,
      code: "NOTE_REQUIRED",
    });
    expect(evaluateAction({ status: "APPROVED", riskLevel: "LOW" }, "REOPEN", "ADMIN", "")).toMatchObject({
      ok: false,
      code: "NOTE_REQUIRED",
    });
  });

  it("allows approval without a note and trims notes", () => {
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "LOW" }, "APPROVE", "ANALYST")).toEqual({
      ok: true,
      toStatus: "APPROVED",
      note: null,
    });
    expect(
      evaluateAction({ status: "PENDING_REVIEW", riskLevel: "LOW" }, "APPROVE", "ANALYST", "  verified  "),
    ).toMatchObject({ ok: true, note: "verified" });
  });

  it("rejects notes over the maximum length", () => {
    const note = "x".repeat(MAX_NOTE_LENGTH + 1);
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "LOW" }, "REJECT", "ANALYST", note)).toMatchObject({
      ok: false,
      code: "NOTE_TOO_LONG",
    });
  });

  it("enforces role permissions after transition validity", () => {
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "HIGH" }, "APPROVE", "ANALYST")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(evaluateAction({ status: "PENDING_REVIEW", riskLevel: "HIGH" }, "APPROVE", "ADMIN")).toMatchObject({
      ok: true,
      toStatus: "APPROVED",
    });
    expect(evaluateAction({ status: "REJECTED", riskLevel: "LOW" }, "REOPEN", "ANALYST", "why")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
