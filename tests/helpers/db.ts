import { PrismaClient, type Prisma } from "@prisma/client";
import type { Actor } from "@/lib/authz";
import type { Role } from "@/lib/kyc/types";

export const db = new PrismaClient();

export async function resetDb() {
  // TRUNCATE bypasses the row-level append-only trigger on AuditEvent.
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "CaseDocument", "Notification", "OutboxMessage", "WebhookEvent", "RuleSet", "KycCase", "User" RESTART IDENTITY CASCADE`,
  );
}

let n = 0;

export async function createUser(role: Role | "SYSTEM", overrides: Partial<Prisma.UserCreateInput> = {}): Promise<Actor & { name: string }> {
  n++;
  const u = await db.user.create({
    data: { email: `${role.toLowerCase()}${n}@test.local`, name: `${role} ${n}`, role, passwordHash: "x", ...overrides },
  });
  return { id: u.id, role: u.role as Role, name: u.name };
}

export async function createCase(overrides: Partial<Prisma.KycCaseUncheckedCreateInput> = {}) {
  n++;
  const riskLevel = overrides.riskLevel ?? "LOW";
  return db.kycCase.create({
    data: {
      caseRef: `TEST-${n}`,
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
      riskScore: riskLevel === "HIGH" ? 90 : riskLevel === "MEDIUM" ? 50 : 20,
      riskLevel,
      reviewReason: "PERIODIC_REFRESH",
      reasonDetail: "Test",
      status: "PENDING_REVIEW",
      dueAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
}
