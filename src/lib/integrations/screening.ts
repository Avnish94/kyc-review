import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { activeAdminIds, appUrl, enqueueTeamsMessage, notifyUsers } from "@/lib/notifications";
import { dueDateFor } from "@/lib/rules/config";
import { getActiveRules } from "@/lib/rules/store";
import { REVIEW_REASONS, REVIEW_REASON_LABELS, riskLevelForScore } from "@/lib/kyc/types";

export const SYSTEM_USER_EMAIL = "screening-engine@system.local";

/**
 * Vendor-neutral screening alert. A thin adapter per provider (e.g. ComplyAdvantage, World-Check,
 * Onfido) maps the vendor's webhook into this shape; see README "Screening integration".
 */
export const screeningAlertSchema = z.object({
  eventId: z.string().min(1).max(200),
  alertId: z.string().min(1).max(200),
  occurredAt: z.iso.datetime(),
  customer: z.object({
    name: z.string().min(1).max(200),
    type: z.enum(["INDIVIDUAL", "BUSINESS"]),
    dateOfBirth: z.iso.date().optional(),
    incorporationDate: z.iso.date().optional(),
    nationality: z.string().min(1).max(100),
    countryOfResidence: z.string().min(1).max(100),
    email: z.email(),
    phone: z.string().min(1).max(40),
    address: z.string().min(1).max(300),
    occupation: z.string().min(1).max(200),
    documentType: z.string().min(1).max(100),
    documentNumberLast4: z.string().regex(/^[A-Za-z0-9]{4}$/),
  }),
  alert: z.object({
    reason: z.enum(REVIEW_REASONS),
    score: z.number().int().min(0).max(100),
    detail: z.string().min(1).max(1000),
  }),
});

export type ScreeningAlert = z.infer<typeof screeningAlertSchema>;

export type IngestResult =
  | { status: "created"; caseId: string; caseRef: string }
  | { status: "duplicate"; caseId: string | null };

export function formatCaseRef(caseNumber: number, createdAt: Date): string {
  return `KYC-${createdAt.getUTCFullYear()}-${String(caseNumber).padStart(4, "0")}`;
}

/**
 * Creates a review case from a screening alert. Idempotent on both the delivery (eventId) and the
 * alert (alertId), so provider retries never create duplicate cases.
 */
export async function ingestScreeningAlert(db: PrismaClient, provider: string, alert: ScreeningAlert): Promise<IngestResult> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { provider, eventId: alert.eventId, payload: alert } });

      const existing = await tx.kycCase.findUnique({ where: { externalRef: alert.alertId }, select: { id: true } });
      if (existing) return { status: "duplicate", caseId: existing.id } as const;

      const system = await tx.user.findUniqueOrThrow({ where: { email: SYSTEM_USER_EMAIL } });
      const rules = await getActiveRules(tx);
      const riskLevel = riskLevelForScore(alert.alert.score, rules.config.riskThresholds);
      const now = new Date();
      const c = alert.customer;

      const created = await tx.kycCase.create({
        data: {
          caseRef: `PENDING-${alert.alertId}`,
          externalRef: alert.alertId,
          source: "SCREENING_WEBHOOK",
          customerName: c.name,
          customerType: c.type,
          dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth) : null,
          incorporationDate: c.incorporationDate ? new Date(c.incorporationDate) : null,
          nationality: c.nationality,
          countryOfResidence: c.countryOfResidence,
          email: c.email.toLowerCase(),
          phone: c.phone,
          address: c.address,
          occupation: c.occupation,
          documentType: c.documentType,
          documentNumber: `•••••${c.documentNumberLast4}`,
          expectedMonthlyVolume: 0,
          riskScore: alert.alert.score,
          riskLevel,
          reviewReason: alert.alert.reason,
          reasonDetail: alert.alert.detail,
          status: "PENDING_REVIEW",
          dueAt: dueDateFor(rules.config, riskLevel, now),
          createdAt: now,
        },
      });
      const caseRef = formatCaseRef(created.caseNumber, now);
      await tx.kycCase.update({ where: { id: created.id }, data: { caseRef } });

      await tx.auditEvent.create({
        data: {
          caseId: created.id,
          actorId: system.id,
          action: "CASE_CREATED",
          fromStatus: null,
          toStatus: "PENDING_REVIEW",
          note: `Opened from ${provider} alert ${alert.alertId}.`,
          ruleSetVersion: rules.version,
          metadata: { provider, alertId: alert.alertId, eventId: alert.eventId },
        },
      });

      if (riskLevel === "HIGH") {
        const title = `New high-risk case ${caseRef}`;
        const body = `${REVIEW_REASON_LABELS[alert.alert.reason]} for ${c.name} (score ${alert.alert.score}).`;
        await notifyUsers(tx, { userIds: await activeAdminIds(tx), caseId: created.id, title, body });
        await enqueueTeamsMessage(tx, { title, text: body, url: appUrl(`/cases/${created.id}`) });
      }

      return { status: "created", caseId: created.id, caseRef } as const;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.kycCase.findUnique({ where: { externalRef: alert.alertId }, select: { id: true } });
      return { status: "duplicate", caseId: existing?.id ?? null };
    }
    throw err;
  }
}
