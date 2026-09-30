import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { evaluateAction } from "../src/lib/kyc/workflow";
import {
  riskLevelForScore,
  type CaseAction,
  type CaseStatus,
  type ReviewReason,
  type Role,
} from "../src/lib/kyc/types";

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: "analyst@demo.local", password: "analyst123", name: "Ava Chen", role: "ANALYST" },
  { email: "analyst2@demo.local", password: "analyst123", name: "Sam Patel", role: "ANALYST" },
  { email: "admin@demo.local", password: "admin123", name: "Marcus Reid", role: "ADMIN" },
] as const satisfies readonly { email: string; password: string; name: string; role: Role }[];

const CASE_COUNT = 60;

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Germany", "France", "Spain", "Mexico",
  "Brazil", "India", "Singapore", "Nigeria", "United Arab Emirates", "Japan", "Australia",
];

const REASONS: { reason: ReviewReason; weight: number; score: [number, number]; detail: () => string }[] = [
  {
    reason: "PERIODIC_REFRESH", weight: 3, score: [8, 45],
    detail: () => "Scheduled periodic KYC refresh; no new alerts since last review.",
  },
  {
    reason: "DOCUMENT_MISMATCH", weight: 3, score: [30, 70],
    detail: () => faker.helpers.arrayElement([
      "Name on submitted ID does not exactly match the application name.",
      "Date of birth on ID differs from the date entered at onboarding.",
      "Proof-of-address document is older than 90 days.",
    ]),
  },
  {
    reason: "UNUSUAL_VOLUME", weight: 3, score: [35, 80],
    detail: () => `Inbound volume ${faker.number.int({ min: 3, max: 12 })}x above the declared monthly expectation over the last 30 days.`,
  },
  {
    reason: "HIGH_RISK_JURISDICTION", weight: 2, score: [45, 85],
    detail: () => "Customer resides in or transacts with a jurisdiction on the internal enhanced-due-diligence list.",
  },
  {
    reason: "ADVERSE_MEDIA", weight: 2, score: [40, 85],
    detail: () => `Screening provider returned ${faker.number.int({ min: 1, max: 4 })} adverse media article(s) with a possible name match.`,
  },
  {
    reason: "PEP_MATCH", weight: 2, score: [55, 92],
    detail: () => `Possible match to a politically exposed person list entry (similarity ${faker.number.int({ min: 78, max: 97 })}%).`,
  },
  {
    reason: "SANCTIONS_NEAR_MATCH", weight: 1, score: [70, 99],
    detail: () => `Fuzzy match against a sanctions list entry (similarity ${faker.number.int({ min: 80, max: 95 })}%); requires manual disambiguation.`,
  },
];

const TARGET_STATUSES: { value: CaseStatus; weight: number }[] = [
  { value: "PENDING_REVIEW", weight: 55 },
  { value: "INFO_REQUESTED", weight: 15 },
  { value: "APPROVED", weight: 15 },
  { value: "REJECTED", weight: 15 },
];

const NOTES: Record<CaseAction, string[]> = {
  APPROVE: [
    "Screening hit confirmed as false positive; identity verified.",
    "Source of funds documentation satisfactory.",
    "Documents verified against issuing authority database.",
  ],
  REJECT: [
    "Unable to disambiguate screening hit; customer declined to provide further ID.",
    "Submitted documents appear altered.",
    "Customer did not respond to information request within 14 days.",
  ],
  REQUEST_INFO: [
    "Please provide a certified copy of passport and a recent utility bill.",
    "Requested source-of-funds evidence for recent large inbound transfers.",
    "Requested explanation of business relationship with flagged counterparty.",
  ],
  MARK_INFO_RECEIVED: ["Customer uploaded requested documents."],
  REOPEN: ["New information received after decision; re-reviewing."],
};

function pathTo(target: CaseStatus): CaseAction[] {
  switch (target) {
    case "PENDING_REVIEW":
      return faker.datatype.boolean(0.15) ? ["REQUEST_INFO", "MARK_INFO_RECEIVED"] : [];
    case "INFO_REQUESTED":
      return ["REQUEST_INFO"];
    case "APPROVED":
      return faker.datatype.boolean(0.3) ? ["REQUEST_INFO", "MARK_INFO_RECEIVED", "APPROVE"] : ["APPROVE"];
    case "REJECTED":
      return faker.datatype.boolean(0.4) ? ["REQUEST_INFO", "REJECT"] : ["REJECT"];
  }
}

function syntheticPhone(): string {
  // 555-01XX numbers are reserved for fictional use.
  return `+1 555-01${faker.string.numeric(2)}`;
}

async function main() {
  faker.seed(20260930);

  await prisma.auditEvent.deleteMany();
  await prisma.kycCase.deleteMany();
  await prisma.user.deleteMany();

  const users = await Promise.all(
    DEMO_USERS.map(async (u) =>
      prisma.user.create({
        data: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
      }),
    ),
  );
  const analysts = users.filter((u) => u.role === "ANALYST");
  const admin = users.find((u) => u.role === "ADMIN")!;
  const system = await prisma.user.create({
    data: {
      email: "screening-engine@system.local",
      name: "Automated Screening",
      role: "SYSTEM", // not a login role; login rejects it
      passwordHash: await bcrypt.hash(faker.string.alphanumeric(32), 10),
    },
  });

  for (let i = 1; i <= CASE_COUNT; i++) {
    const r = faker.helpers.weightedArrayElement(REASONS.map((x) => ({ value: x, weight: x.weight })));
    const riskScore = faker.number.int({ min: r.score[0], max: r.score[1] });
    const riskLevel = riskLevelForScore(riskScore);
    const isBusiness = faker.datatype.boolean(0.25);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const customerName = isBusiness ? faker.company.name() : `${firstName} ${lastName}`;
    const createdAt = faker.date.recent({ days: 45 });
    const country = faker.helpers.arrayElement(COUNTRIES);

    const created = await prisma.kycCase.create({
      data: {
        caseRef: `KYC-2026-${String(i).padStart(4, "0")}`,
        customerName,
        customerType: isBusiness ? "BUSINESS" : "INDIVIDUAL",
        dateOfBirth: isBusiness ? null : faker.date.birthdate({ mode: "age", min: 19, max: 82 }),
        incorporationDate: isBusiness ? faker.date.past({ years: 15 }) : null,
        nationality: isBusiness ? country : faker.helpers.arrayElement(COUNTRIES),
        countryOfResidence: country,
        email: isBusiness
          ? `compliance@${faker.helpers.slugify(customerName).toLowerCase().slice(0, 20)}.example.com`
          : faker.internet.email({ firstName, lastName, provider: "example.com" }).toLowerCase(),
        phone: syntheticPhone(),
        address: `${faker.location.streetAddress()}, ${faker.location.city()}, ${country}`,
        occupation: isBusiness ? faker.company.buzzNoun().replace(/^\w/, (c) => c.toUpperCase()) : faker.person.jobTitle(),
        documentType: isBusiness
          ? "Certificate of incorporation"
          : faker.helpers.arrayElement(["Passport", "National ID card", "Driver's license"]),
        documentNumber: `${faker.string.alpha({ length: 1, casing: "upper" })}•••••${faker.string.numeric(4)}`,
        expectedMonthlyVolume: faker.number.int({ min: 1, max: isBusiness ? 500 : 40 }) * 1000,
        riskScore,
        riskLevel,
        reviewReason: r.reason,
        reasonDetail: r.detail(),
        status: "PENDING_REVIEW",
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        caseId: created.id, actorId: system.id, action: "CASE_CREATED",
        fromStatus: null, toStatus: "PENDING_REVIEW",
        note: "Case opened by automated screening.", createdAt,
      },
    });

    // Replay history through the real workflow rules so seeded data is always consistent.
    const target = faker.helpers.weightedArrayElement(TARGET_STATUSES);
    let status: CaseStatus = "PENDING_REVIEW";
    let at = createdAt;
    for (const action of pathTo(target)) {
      const needsAdmin = (action === "APPROVE" || action === "REJECT") && riskLevel === "HIGH";
      const actor = needsAdmin ? admin : faker.helpers.arrayElement(analysts);
      const decision = evaluateAction(
        { status, riskLevel },
        action,
        actor.role as Role,
        faker.helpers.arrayElement(NOTES[action]),
      );
      if (!decision.ok) throw new Error(`Seed produced invalid transition: ${decision.message}`);
      at = new Date(Math.min(Date.now(), at.getTime() + faker.number.int({ min: 1, max: 72 }) * 3_600_000));
      await prisma.auditEvent.create({
        data: {
          caseId: created.id, actorId: actor.id, action,
          fromStatus: status, toStatus: decision.toStatus, note: decision.note, createdAt: at,
        },
      });
      status = decision.toStatus;
    }
    if (at !== createdAt) {
      await prisma.kycCase.update({ where: { id: created.id }, data: { status, updatedAt: at } });
    }
  }

  const count = await prisma.kycCase.count();
  console.log(`Seeded ${users.length} demo users and ${count} synthetic KYC cases.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
