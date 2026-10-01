import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz";
import { assignCase, performCaseAction } from "@/lib/kyc/service";
import { DEFAULT_RULES } from "@/lib/rules/config";
import { getActiveRules, publishRuleSet } from "@/lib/rules/store";
import { createCase, createUser, db, resetDb } from "./helpers/db";

let analyst: Actor;
let admin: Actor;
let admin2: Actor;

beforeEach(async () => {
  await resetDb();
  analyst = await createUser("ANALYST");
  admin = await createUser("ADMIN");
  admin2 = await createUser("ADMIN");
});

afterAll(() => db.$disconnect());

describe("performCaseAction", () => {
  it("updates status and writes an audit record with the rule version atomically", async () => {
    await publishRuleSet(db, { config: DEFAULT_RULES, comment: "v1", createdById: admin.id });
    const c = await createCase({ assigneeId: analyst.id });
    const result = await performCaseAction(db, {
      caseId: c.id, action: "REQUEST_INFO", note: "Need passport", expectedStatus: "PENDING_REVIEW", actor: analyst,
    });

    expect(result).toEqual({ ok: true, toStatus: "INFO_REQUESTED" });
    expect((await db.kycCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("INFO_REQUESTED");
    const events = await db.auditEvent.findMany({ where: { caseId: c.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: analyst.id, action: "REQUEST_INFO", fromStatus: "PENDING_REVIEW", toStatus: "INFO_REQUESTED",
      note: "Need passport", ruleSetVersion: 1,
    });
  });

  it("writes nothing when the action is refused", async () => {
    const c = await createCase({ riskLevel: "HIGH", assigneeId: analyst.id });
    const result = await performCaseAction(db, { caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: analyst });
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("rejects stale submissions with a conflict", async () => {
    const c = await createCase({ status: "INFO_REQUESTED" });
    const result = await performCaseAction(db, {
      caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: admin,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("runs the full four-eyes flow with notifications and recorded identities", async () => {
    const c = await createCase({ riskLevel: "HIGH", reviewReason: "PERIODIC_REFRESH", assigneeId: analyst.id });

    const submit = await performCaseAction(db, {
      caseId: c.id, action: "SUBMIT_FOR_APPROVAL", recommendation: "APPROVE", note: "False positive",
      expectedStatus: "PENDING_REVIEW", actor: analyst,
    });
    expect(submit).toEqual({ ok: true, toStatus: "PENDING_APPROVAL" });
    const pending = await db.kycCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(pending).toMatchObject({ submittedById: analyst.id, recommendation: "APPROVE" });

    // Both Admins are notified, plus a Teams message is queued.
    expect(await db.notification.count({ where: { caseId: c.id } })).toBe(2);
    expect(await db.outboxMessage.count({ where: { channel: "TEAMS", status: "PENDING" } })).toBe(1);

    const approve = await performCaseAction(db, {
      caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_APPROVAL", actor: admin2,
    });
    expect(approve).toEqual({ ok: true, toStatus: "APPROVED" });
    const decided = await db.kycCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(decided).toMatchObject({ status: "APPROVED", submittedById: null, recommendation: null });
    expect(decided.decidedAt).not.toBeNull();

    // The submitting analyst hears about the decision.
    expect(await db.notification.count({ where: { userId: analyst.id } })).toBe(1);
    const audit = await db.auditEvent.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((e) => [e.action, e.actorId])).toEqual([
      ["SUBMIT_FOR_APPROVAL", analyst.id],
      ["APPROVE", admin2.id],
    ]);
    expect(audit[0].metadata).toEqual({ recommendation: "APPROVE" });
  });

  it("blocks an Admin from approving their own submission", async () => {
    const c = await createCase({ riskLevel: "HIGH", assigneeId: admin.id });
    await performCaseAction(db, {
      caseId: c.id, action: "SUBMIT_FOR_APPROVAL", recommendation: "REJECT", note: "Confirmed match",
      expectedStatus: "PENDING_REVIEW", actor: admin,
    });
    const result = await performCaseAction(db, {
      caseId: c.id, action: "REJECT", note: "Confirmed", expectedStatus: "PENDING_APPROVAL", actor: admin,
    });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("applies a newly published rule set immediately and records its version", async () => {
    await publishRuleSet(db, { config: DEFAULT_RULES, comment: "v1", createdById: admin.id });
    await publishRuleSet(db, {
      config: { ...DEFAULT_RULES, fourEyesRiskLevels: [], analystDecisionRiskLevels: ["LOW", "MEDIUM", "HIGH"] },
      comment: "relax",
      createdById: admin.id,
    });
    expect((await getActiveRules(db)).version).toBe(2);

    const c = await createCase({ riskLevel: "HIGH", assigneeId: analyst.id });
    const result = await performCaseAction(db, { caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: analyst });
    expect(result).toEqual({ ok: true, toStatus: "APPROVED" });
    expect((await db.auditEvent.findFirstOrThrow({ where: { caseId: c.id } })).ruleSetVersion).toBe(2);
  });

  it("resets the SLA clock when a case is reopened", async () => {
    const c = await createCase({ status: "APPROVED", dueAt: new Date("2020-01-01"), decidedAt: new Date("2020-01-01") });
    await performCaseAction(db, { caseId: c.id, action: "REOPEN", note: "New info", expectedStatus: "APPROVED", actor: admin });
    const reopened = await db.kycCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(reopened.decidedAt).toBeNull();
    expect(reopened.dueAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("assignCase", () => {
  it("lets an analyst claim an unassigned case, with audit and no self-notification", async () => {
    const c = await createCase();
    const result = await assignCase(db, { caseId: c.id, actor: analyst, assigneeId: analyst.id, expectedAssigneeId: null });
    expect(result).toEqual({ ok: true });
    expect((await db.kycCase.findUniqueOrThrow({ where: { id: c.id } })).assigneeId).toBe(analyst.id);
    expect(await db.auditEvent.findFirst({ where: { caseId: c.id } })).toMatchObject({ action: "ASSIGN", fromStatus: null });
    expect(await db.notification.count()).toBe(0);
  });

  it("notifies the assignee when an Admin assigns a case", async () => {
    const c = await createCase();
    await assignCase(db, { caseId: c.id, actor: admin, assigneeId: analyst.id, expectedAssigneeId: null });
    expect(await db.notification.count({ where: { userId: analyst.id } })).toBe(1);
  });

  it("refuses stale or unauthorised assignments", async () => {
    const other = await createUser("ANALYST");
    const c = await createCase({ assigneeId: other.id });
    expect(await assignCase(db, { caseId: c.id, actor: analyst, assigneeId: analyst.id, expectedAssigneeId: null })).toMatchObject({
      code: "CONFLICT",
    });
    expect(await assignCase(db, { caseId: c.id, actor: analyst, assigneeId: analyst.id, expectedAssigneeId: other.id })).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses system or inactive assignees", async () => {
    const system = await createUser("SYSTEM");
    const c = await createCase();
    expect(await assignCase(db, { caseId: c.id, actor: admin, assigneeId: system.id, expectedAssigneeId: null })).toMatchObject({
      code: "INVALID_ASSIGNEE",
    });
  });
});

describe("audit log integrity", () => {
  it("rejects updates and deletes at the database level", async () => {
    const c = await createCase({ assigneeId: analyst.id });
    await performCaseAction(db, { caseId: c.id, action: "REQUEST_INFO", note: "x", expectedStatus: "PENDING_REVIEW", actor: analyst });
    const event = await db.auditEvent.findFirstOrThrow();
    await expect(db.auditEvent.update({ where: { id: event.id }, data: { note: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);
  });
});
