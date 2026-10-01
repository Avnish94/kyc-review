import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_USER_EMAIL, ingestScreeningAlert, screeningAlertSchema, type ScreeningAlert } from "@/lib/integrations/screening";
import { signWebhookBody, verifyWebhookSignature } from "@/lib/integrations/webhook-signature";
import { createUser, db, resetDb } from "./helpers/db";

const SECRET = "test-secret";
const NOW = 1_800_000_000;

describe("webhook signatures", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a valid, recent signature", () => {
    expect(verifyWebhookSignature(body, signWebhookBody(body, SECRET, NOW), SECRET, NOW + 10)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, stale timestamps and malformed headers", () => {
    const header = signWebhookBody(body, SECRET, NOW);
    expect(verifyWebhookSignature(body + " ", header, SECRET, NOW)).toBe(false);
    expect(verifyWebhookSignature(body, header, "other", NOW)).toBe(false);
    expect(verifyWebhookSignature(body, header, SECRET, NOW + 301)).toBe(false);
    expect(verifyWebhookSignature(body, "garbage", SECRET, NOW)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET, NOW)).toBe(false);
  });
});

function alert(overrides: Partial<ScreeningAlert["alert"]> = {}, ids = { eventId: "evt-1", alertId: "alert-1" }): ScreeningAlert {
  return screeningAlertSchema.parse({
    ...ids,
    occurredAt: "2026-09-30T12:00:00Z",
    customer: {
      name: "Synthetic Person",
      type: "INDIVIDUAL",
      dateOfBirth: "1980-05-01",
      nationality: "Canada",
      countryOfResidence: "Canada",
      email: "Synthetic@Example.com",
      phone: "+1 555-0101",
      address: "1 Test St, Toronto, Canada",
      occupation: "Engineer",
      documentType: "Passport",
      documentNumberLast4: "1234",
    },
    alert: { reason: "PEP_MATCH", score: 85, detail: "Possible PEP match", ...overrides },
  });
}

describe("ingestScreeningAlert", () => {
  beforeEach(async () => {
    await resetDb();
    await createUser("SYSTEM", { email: SYSTEM_USER_EMAIL });
  });

  afterAll(() => db.$disconnect());

  it("creates a case with risk, SLA and an audit record, and alerts Admins for high risk", async () => {
    const admin = await createUser("ADMIN");
    const result = await ingestScreeningAlert(db, "mock", alert());
    expect(result.status).toBe("created");
    if (result.status !== "created") return;

    const c = await db.kycCase.findUniqueOrThrow({ where: { id: result.caseId } });
    expect(c).toMatchObject({
      caseRef: result.caseRef, source: "SCREENING_WEBHOOK", externalRef: "alert-1", riskLevel: "HIGH",
      status: "PENDING_REVIEW", email: "synthetic@example.com", documentNumber: "•••••1234",
    });
    expect(c.caseRef).toMatch(/^KYC-\d{4}-\d{4}$/);
    expect(c.dueAt.getTime() - c.createdAt.getTime()).toBe(24 * 3_600_000);
    expect(await db.auditEvent.findFirst({ where: { caseId: c.id } })).toMatchObject({ action: "CASE_CREATED" });
    expect(await db.notification.count({ where: { userId: admin.id } })).toBe(1);
    expect(await db.outboxMessage.count()).toBe(1);
  });

  it("is idempotent for redelivered events and repeated alerts", async () => {
    const first = await ingestScreeningAlert(db, "mock", alert());
    const redelivery = await ingestScreeningAlert(db, "mock", alert());
    const sameAlertNewEvent = await ingestScreeningAlert(db, "mock", alert({}, { eventId: "evt-2", alertId: "alert-1" }));
    expect(first.status).toBe("created");
    expect(redelivery.status).toBe("duplicate");
    expect(sameAlertNewEvent).toEqual({ status: "duplicate", caseId: first.status === "created" ? first.caseId : null });
    expect(await db.kycCase.count()).toBe(1);
  });

  it("does not page Admins for low-risk alerts", async () => {
    await createUser("ADMIN");
    await ingestScreeningAlert(db, "mock", alert({ score: 10, reason: "PERIODIC_REFRESH" }));
    expect(await db.notification.count()).toBe(0);
    expect(await db.outboxMessage.count()).toBe(0);
  });

  it("validates the payload shape", () => {
    expect(screeningAlertSchema.safeParse({ eventId: "x" }).success).toBe(false);
  });
});
