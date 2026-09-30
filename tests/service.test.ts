import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { performCaseAction, type Actor } from "@/lib/kyc/service";
import type { CaseStatus, RiskLevel } from "@/lib/kyc/types";

const db = new PrismaClient();

let analyst: Actor;
let admin: Actor;

async function createCase(status: CaseStatus = "PENDING_REVIEW", riskLevel: RiskLevel = "LOW") {
  return db.kycCase.create({
    data: {
      caseRef: `TEST-${Math.random().toString(36).slice(2, 10)}`,
      customerName: "Test Customer",
      customerType: "INDIVIDUAL",
      nationality: "Canada",
      countryOfResidence: "Canada",
      email: "test@example.com",
      phone: "+1 555-0100",
      address: "1 Test St",
      occupation: "Tester",
      documentType: "Passport",
      documentNumber: "P•••••0000",
      expectedMonthlyVolume: 1000,
      riskScore: riskLevel === "HIGH" ? 90 : 20,
      riskLevel,
      reviewReason: "PERIODIC_REFRESH",
      reasonDetail: "Test",
      status,
    },
  });
}

beforeEach(async () => {
  await db.auditEvent.deleteMany();
  await db.kycCase.deleteMany();
  await db.user.deleteMany();
  const a = await db.user.create({ data: { email: "a@test", name: "Analyst", role: "ANALYST", passwordHash: "x" } });
  const b = await db.user.create({ data: { email: "b@test", name: "Admin", role: "ADMIN", passwordHash: "x" } });
  analyst = { id: a.id, role: "ANALYST" };
  admin = { id: b.id, role: "ADMIN" };
});

afterAll(async () => {
  await db.$disconnect();
});

describe("performCaseAction", () => {
  it("updates status and writes an audit record atomically", async () => {
    const c = await createCase();
    const result = await performCaseAction(db, {
      caseId: c.id, action: "REQUEST_INFO", note: "Need passport", expectedStatus: "PENDING_REVIEW", actor: analyst,
    });

    expect(result).toEqual({ ok: true, toStatus: "INFO_REQUESTED" });
    expect((await db.kycCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("INFO_REQUESTED");
    const events = await db.auditEvent.findMany({ where: { caseId: c.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: analyst.id, action: "REQUEST_INFO", fromStatus: "PENDING_REVIEW", toStatus: "INFO_REQUESTED", note: "Need passport",
    });
    expect(events[0].createdAt).toBeInstanceOf(Date);
  });

  it("does not change status or write audit when the actor lacks permission", async () => {
    const c = await createCase("PENDING_REVIEW", "HIGH");
    const result = await performCaseAction(db, {
      caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: analyst,
    });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await db.kycCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING_REVIEW");
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("lets an Admin decide a HIGH risk case", async () => {
    const c = await createCase("PENDING_REVIEW", "HIGH");
    const result = await performCaseAction(db, {
      caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: admin,
    });
    expect(result).toEqual({ ok: true, toStatus: "APPROVED" });
  });

  it("rejects invalid transitions without side effects", async () => {
    const c = await createCase("APPROVED");
    const result = await performCaseAction(db, {
      caseId: c.id, action: "REJECT", note: "nope", expectedStatus: "APPROVED", actor: admin,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("returns CONFLICT when the case changed since the user loaded it", async () => {
    const c = await createCase("PENDING_REVIEW");
    await performCaseAction(db, { caseId: c.id, action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: analyst });

    const stale = await performCaseAction(db, {
      caseId: c.id, action: "REJECT", note: "late", expectedStatus: "PENDING_REVIEW", actor: analyst,
    });
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await db.auditEvent.count()).toBe(1);
  });

  it("returns NOT_FOUND for unknown cases", async () => {
    const result = await performCaseAction(db, {
      caseId: "missing", action: "APPROVE", expectedStatus: "PENDING_REVIEW", actor: admin,
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
