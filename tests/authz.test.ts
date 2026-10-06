import { describe, expect, it } from "vitest";
import { canAssign, canExportData, canManageRules, canPerformAction, type Actor, type AuthzCase } from "@/lib/authz";
import { DEFAULT_RULES } from "@/lib/rules/config";

const analyst: Actor = { id: "analyst-1", role: "ANALYST" };
const otherAnalyst: Actor = { id: "analyst-2", role: "ANALYST" };
const admin: Actor = { id: "admin-1", role: "ADMIN" };
const otherAdmin: Actor = { id: "admin-2", role: "ADMIN" };

const kase = (overrides: Partial<AuthzCase> = {}): AuthzCase => ({
  status: "PENDING_REVIEW",
  riskLevel: "LOW",
  assigneeId: analyst.id,
  submittedById: null,
  ...overrides,
});

describe("canPerformAction", () => {
  it("lets the assigned analyst decide low and medium risk cases", () => {
    expect(canPerformAction(analyst, "APPROVE", kase(), DEFAULT_RULES).allowed).toBe(true);
    expect(canPerformAction(analyst, "REJECT", kase({ riskLevel: "MEDIUM" }), DEFAULT_RULES).allowed).toBe(true);
  });

  it("requires an Admin for high-risk decisions under the default rules", () => {
    const result = canPerformAction(analyst, "APPROVE", kase({ riskLevel: "HIGH" }), DEFAULT_RULES);
    expect(result).toEqual({ allowed: false, reason: "High-risk decisions require an Admin." });
  });

  it("follows the configured analyst decision levels", () => {
    const rules = { ...DEFAULT_RULES, analystDecisionRiskLevels: ["LOW" as const] };
    expect(canPerformAction(analyst, "APPROVE", kase({ riskLevel: "MEDIUM" }), rules).allowed).toBe(false);
  });

  it("blocks analysts from cases that are unassigned or assigned to someone else", () => {
    expect(canPerformAction(otherAnalyst, "REQUEST_INFO", kase(), DEFAULT_RULES)).toEqual({
      allowed: false,
      reason: "This case is assigned to someone else.",
    });
    expect(canPerformAction(analyst, "REQUEST_INFO", kase({ assigneeId: null }), DEFAULT_RULES)).toEqual({
      allowed: false,
      reason: "Assign this case to yourself first.",
    });
  });

  it("lets Admins act on any open case regardless of assignment", () => {
    expect(canPerformAction(admin, "APPROVE", kase({ riskLevel: "HIGH", assigneeId: null }), DEFAULT_RULES).allowed).toBe(true);
  });

  it("allows only Admins to reopen", () => {
    expect(canPerformAction(analyst, "REOPEN", kase({ status: "APPROVED" }), DEFAULT_RULES).allowed).toBe(false);
    expect(canPerformAction(admin, "REOPEN", kase({ status: "APPROVED" }), DEFAULT_RULES).allowed).toBe(true);
  });

  describe("four-eyes approval", () => {
    const pending = kase({ status: "PENDING_APPROVAL", riskLevel: "HIGH", submittedById: admin.id });

    it("prevents the submitter from deciding their own submission", () => {
      expect(canPerformAction(admin, "APPROVE", pending, DEFAULT_RULES)).toEqual({
        allowed: false,
        reason: "Four-eyes rule: you submitted this case, so a different Admin must decide it.",
      });
    });

    it("allows a different Admin to decide or send back", () => {
      expect(canPerformAction(otherAdmin, "APPROVE", pending, DEFAULT_RULES).allowed).toBe(true);
      expect(canPerformAction(otherAdmin, "SEND_BACK", pending, DEFAULT_RULES).allowed).toBe(true);
    });

    it("does not let analysts act on pending approvals, even when assigned", () => {
      expect(canPerformAction(analyst, "SEND_BACK", { ...pending, submittedById: otherAnalyst.id }, DEFAULT_RULES).allowed).toBe(false);
    });
  });
});

describe("canAssign", () => {
  const open = { status: "PENDING_REVIEW" as const, assigneeId: null };

  it("lets anyone claim an unassigned open case", () => {
    expect(canAssign(analyst, open, analyst.id).allowed).toBe(true);
  });

  it("stops analysts taking or giving away other people's cases", () => {
    expect(canAssign(analyst, { ...open, assigneeId: otherAnalyst.id }, analyst.id).allowed).toBe(false);
    expect(canAssign(analyst, open, otherAnalyst.id).allowed).toBe(false);
    expect(canAssign(analyst, { ...open, assigneeId: otherAnalyst.id }, null).allowed).toBe(false);
  });

  it("lets the assignee unassign themselves", () => {
    expect(canAssign(analyst, { ...open, assigneeId: analyst.id }, null).allowed).toBe(true);
  });

  it("lets Admins reassign freely, but never decided cases", () => {
    expect(canAssign(admin, { ...open, assigneeId: analyst.id }, otherAnalyst.id).allowed).toBe(true);
    expect(canAssign(admin, { status: "APPROVED", assigneeId: analyst.id }, otherAnalyst.id).allowed).toBe(false);
  });
});

describe("admin-only capabilities", () => {
  it("restricts rule management and exports to Admins", () => {
    expect(canManageRules("ADMIN")).toBe(true);
    expect(canManageRules("ANALYST")).toBe(false);
    expect(canExportData("ADMIN")).toBe(true);
    expect(canExportData("ANALYST")).toBe(false);
  });
});
