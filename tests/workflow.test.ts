import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz";
import { CASE_ACTIONS, CASE_STATUSES, type CaseAction, type CaseStatus } from "@/lib/kyc/types";
import { TRANSITIONS, availableActions, evaluateAction, type WorkflowCase } from "@/lib/kyc/workflow";
import { DEFAULT_RULES, type RuleSetConfig } from "@/lib/rules/config";

const analyst: Actor = { id: "analyst-1", role: "ANALYST" };
const admin: Actor = { id: "admin-1", role: "ADMIN" };
const admin2: Actor = { id: "admin-2", role: "ADMIN" };

const kase = (overrides: Partial<WorkflowCase> = {}): WorkflowCase => ({
  status: "PENDING_REVIEW",
  riskLevel: "LOW",
  reviewReason: "PERIODIC_REFRESH",
  assigneeId: analyst.id,
  submittedById: null,
  documentCategories: [],
  ...overrides,
});

const run = (
  action: CaseAction,
  overrides: Partial<WorkflowCase> = {},
  extra: { actor?: Actor; note?: string; recommendation?: "APPROVE" | "REJECT"; rules?: RuleSetConfig } = {},
) =>
  evaluateAction({
    kycCase: kase(overrides),
    action,
    actor: extra.actor ?? admin,
    rules: extra.rules ?? DEFAULT_RULES,
    note: extra.note ?? "A note",
    recommendation: extra.recommendation,
  });

describe("transition table", () => {
  const expected: Record<CaseAction, [CaseStatus[], CaseStatus]> = {
    APPROVE: [["PENDING_REVIEW", "PENDING_APPROVAL"], "APPROVED"],
    REJECT: [["PENDING_REVIEW", "INFO_REQUESTED", "PENDING_APPROVAL"], "REJECTED"],
    REQUEST_INFO: [["PENDING_REVIEW"], "INFO_REQUESTED"],
    MARK_INFO_RECEIVED: [["INFO_REQUESTED"], "PENDING_REVIEW"],
    SUBMIT_FOR_APPROVAL: [["PENDING_REVIEW"], "PENDING_APPROVAL"],
    SEND_BACK: [["PENDING_APPROVAL"], "PENDING_REVIEW"],
    REOPEN: [["APPROVED", "REJECTED"], "PENDING_REVIEW"],
  };

  it.each(CASE_ACTIONS)("%s has the expected sources and target", (action) => {
    expect([...TRANSITIONS[action].from].sort()).toEqual([...expected[action][0]].sort());
    expect(TRANSITIONS[action].to).toBe(expected[action][1]);
  });

  it("refuses every transition not in the table", () => {
    for (const status of CASE_STATUSES) {
      for (const action of CASE_ACTIONS) {
        if (TRANSITIONS[action].from.includes(status)) continue;
        const result = run(action, { status, riskLevel: "LOW" }, { recommendation: "APPROVE" });
        expect(result.ok, `${action} from ${status}`).toBe(false);
        if (!result.ok) expect(result.code).toBe("INVALID_TRANSITION");
      }
    }
  });
});

describe("four-eyes routing", () => {
  it("offers direct decisions for non-four-eyes risk levels", () => {
    expect(availableActions({ status: "PENDING_REVIEW", riskLevel: "MEDIUM" }, DEFAULT_RULES)).toEqual([
      "APPROVE",
      "REJECT",
      "REQUEST_INFO",
    ]);
  });

  it("replaces direct decisions with submit-for-approval for four-eyes risk levels", () => {
    expect(availableActions({ status: "PENDING_REVIEW", riskLevel: "HIGH" }, DEFAULT_RULES)).toEqual([
      "REQUEST_INFO",
      "SUBMIT_FOR_APPROVAL",
    ]);
    const result = run("APPROVE", { riskLevel: "HIGH" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    if (!result.ok) expect(result.message).toContain("four-eyes");
  });

  it("offers approve, reject and send back on a pending approval", () => {
    expect(availableActions({ status: "PENDING_APPROVAL", riskLevel: "HIGH" }, DEFAULT_RULES)).toEqual([
      "APPROVE",
      "REJECT",
      "SEND_BACK",
    ]);
  });

  it("requires a recommendation to submit", () => {
    expect(run("SUBMIT_FOR_APPROVAL", { riskLevel: "HIGH" }, { actor: analyst })).toMatchObject({
      ok: false,
      code: "RECOMMENDATION_REQUIRED",
    });
    expect(run("SUBMIT_FOR_APPROVAL", { riskLevel: "HIGH" }, { actor: analyst, recommendation: "REJECT" })).toEqual({
      ok: true,
      toStatus: "PENDING_APPROVAL",
      note: "A note",
      recommendation: "REJECT",
    });
  });

  it("lets a different Admin approve, but not the submitter", () => {
    const pending = { status: "PENDING_APPROVAL" as const, riskLevel: "HIGH" as const, submittedById: admin.id };
    expect(run("APPROVE", pending, { actor: admin })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(run("APPROVE", pending, { actor: admin2 })).toMatchObject({ ok: true, toStatus: "APPROVED" });
  });

  it("follows the configured four-eyes levels", () => {
    const rules = { ...DEFAULT_RULES, fourEyesRiskLevels: [] };
    expect(run("APPROVE", { riskLevel: "HIGH" }, { rules })).toMatchObject({ ok: true, toStatus: "APPROVED" });
  });
});

describe("notes", () => {
  it("enforces the configured note requirements", () => {
    expect(run("REJECT", {}, { note: "  " })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    expect(run("APPROVE", {}, { note: "" })).toMatchObject({ ok: true, note: null });
    const rules = { ...DEFAULT_RULES, notesRequired: { ...DEFAULT_RULES.notesRequired, APPROVE: true } };
    expect(run("APPROVE", {}, { note: "", rules })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
  });

  it("rejects overly long notes", () => {
    expect(run("REJECT", {}, { note: "x".repeat(1001) })).toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
  });
});

describe("evidence gating", () => {
  const pep = { reviewReason: "PEP_MATCH" as const, riskLevel: "MEDIUM" as const };

  it("blocks approval until the required evidence is present", () => {
    const result = run("APPROVE", { ...pep, documentCategories: ["IDENTITY"] });
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_MISSING" });
    if (!result.ok) expect(result.message).toContain("Source of funds");
    expect(run("APPROVE", { ...pep, documentCategories: ["IDENTITY", "SOURCE_OF_FUNDS"] })).toMatchObject({ ok: true });
  });

  it("also gates submitting an approval recommendation, but not a rejection", () => {
    const high = { reviewReason: "PEP_MATCH" as const, riskLevel: "HIGH" as const };
    expect(run("SUBMIT_FOR_APPROVAL", high, { actor: analyst, recommendation: "APPROVE" })).toMatchObject({
      code: "EVIDENCE_MISSING",
    });
    expect(run("SUBMIT_FOR_APPROVAL", high, { actor: analyst, recommendation: "REJECT" })).toMatchObject({ ok: true });
    expect(run("REJECT", pep)).toMatchObject({ ok: true });
  });

  it("can be switched off by configuration", () => {
    expect(run("APPROVE", pep, { rules: { ...DEFAULT_RULES, requireEvidenceToApprove: false } })).toMatchObject({ ok: true });
  });
});
