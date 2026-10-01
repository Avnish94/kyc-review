import { faker } from "@faker-js/faker";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syntheticPdf } from "../scripts/synthetic-pdf";
import { getStorage, newStorageKey, sha256Hex } from "../src/lib/documents/storage";
import { formatCaseRef, SYSTEM_USER_EMAIL } from "../src/lib/integrations/screening";
import { evaluateAction } from "../src/lib/kyc/workflow";
import { DEFAULT_RULES, dueDateFor, missingEvidence } from "../src/lib/rules/config";
import {
  DOCUMENT_CATEGORY_LABELS,
  riskLevelForScore,
  type CaseAction,
  type CaseStatus,
  type DocumentCategory,
  type Recommendation,
  type ReviewReason,
  type RiskLevel,
  type Role,
} from "../src/lib/kyc/types";

const prisma = new PrismaClient();
const storage = getStorage();
const rules = DEFAULT_RULES;

const DEMO_USERS = [
  { email: "analyst@demo.local", password: "analyst123", name: "Ava Chen", role: "ANALYST" },
  { email: "analyst2@demo.local", password: "analyst123", name: "Sam Patel", role: "ANALYST" },
  { email: "admin@demo.local", password: "admin123", name: "Marcus Reid", role: "ADMIN" },
  { email: "admin2@demo.local", password: "admin123", name: "Dana Brooks", role: "ADMIN" },
] as const satisfies readonly { email: string; password: string; name: string; role: Role }[];

const CASE_COUNT = 60;

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Germany", "France", "Spain", "Mexico",
  "Brazil", "India", "Singapore", "Nigeria", "United Arab Emirates", "Japan", "Australia",
];

const REASONS: { reason: ReviewReason; weight: number; score: [number, number]; detail: () => string }[] = [
  { reason: "PERIODIC_REFRESH", weight: 3, score: [8, 45], detail: () => "Scheduled periodic KYC refresh; no new alerts since last review." },
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

type Target = CaseStatus | "UNASSIGNED";
const TARGETS: { value: Target; weight: number }[] = [
  { value: "UNASSIGNED", weight: 22 },
  { value: "PENDING_REVIEW", weight: 20 },
  { value: "INFO_REQUESTED", weight: 12 },
  { value: "PENDING_APPROVAL", weight: 10 },
  { value: "APPROVED", weight: 18 },
  { value: "REJECTED", weight: 18 },
];

/**
 * A few fixed cases so every demo has something to show: cases awaiting four-eyes approval, and
 * high-risk cases assigned to the first demo analyst that need evidence before submission.
 */
const DEMO_FIXTURES: Record<number, { target: Target; highRisk?: boolean; assignee?: number }> = {
  1: { target: "PENDING_APPROVAL", assignee: 0 },
  2: { target: "PENDING_APPROVAL", assignee: 1 },
  3: { target: "PENDING_APPROVAL", assignee: 0 },
  4: { target: "PENDING_APPROVAL", assignee: 1 },
  5: { target: "PENDING_REVIEW", highRisk: true, assignee: 0 },
  6: { target: "PENDING_REVIEW", highRisk: true, assignee: 0 },
  7: { target: "PENDING_REVIEW", assignee: 0 },
};

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
  SUBMIT_FOR_APPROVAL: [
    "Evidence reviewed; hit appears to be a false positive. Requesting second-line sign-off.",
    "Enhanced due diligence complete; recommending decision per attached evidence.",
  ],
  SEND_BACK: ["Please verify the source-of-funds document against bank statements."],
  REOPEN: ["New information received after decision; re-reviewing."],
};

type Step =
  | { kind: "assign" }
  | { kind: "evidence" }
  | { kind: "action"; action: CaseAction; by: "assignee" | "approver"; recommendation?: Recommendation };

function plan(target: Target, riskLevel: RiskLevel): Step[] {
  const fourEyes = rules.fourEyesRiskLevels.includes(riskLevel);
  const act = (action: CaseAction, by: "assignee" | "approver" = "assignee", recommendation?: Recommendation): Step => ({
    kind: "action", action, by, recommendation,
  });
  const infoRound = faker.datatype.boolean(0.3) ? [act("REQUEST_INFO"), act("MARK_INFO_RECEIVED")] : [];
  switch (target) {
    case "UNASSIGNED":
      return [];
    case "PENDING_REVIEW":
      return [{ kind: "assign" }, ...infoRound];
    case "INFO_REQUESTED":
      return [{ kind: "assign" }, act("REQUEST_INFO")];
    case "PENDING_APPROVAL":
      return fourEyes
        ? [{ kind: "assign" }, ...infoRound, { kind: "evidence" }, act("SUBMIT_FOR_APPROVAL", "assignee", "APPROVE")]
        : [{ kind: "assign" }];
    case "APPROVED":
      return fourEyes
        ? [{ kind: "assign" }, ...infoRound, { kind: "evidence" }, act("SUBMIT_FOR_APPROVAL", "assignee", "APPROVE"), act("APPROVE", "approver")]
        : [{ kind: "assign" }, ...infoRound, { kind: "evidence" }, act("APPROVE")];
    case "REJECTED":
      return fourEyes
        ? [{ kind: "assign" }, act("SUBMIT_FOR_APPROVAL", "assignee", "REJECT"), act("REJECT", "approver")]
        : [{ kind: "assign" }, ...(faker.datatype.boolean(0.4) ? [act("REQUEST_INFO")] : []), act("REJECT")];
  }
}

function syntheticPhone(): string {
  // 555-01XX numbers are reserved for fictional use.
  return `+1 555-01${faker.string.numeric(2)}`;
}

async function main() {
  faker.seed(20260930);

  // TRUNCATE bypasses the append-only trigger on AuditEvent (row-level triggers do not fire).
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "CaseDocument", "Notification", "OutboxMessage", "WebhookEvent", "RuleSet", "KycCase", "User" RESTART IDENTITY CASCADE`,
  );

  const users = await Promise.all(
    DEMO_USERS.map(async (u) =>
      prisma.user.create({
        data: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
      }),
    ),
  );
  const analysts = users.filter((u) => u.role === "ANALYST");
  const admins = users.filter((u) => u.role === "ADMIN");
  const system = await prisma.user.create({
    data: { email: SYSTEM_USER_EMAIL, name: "Automated Screening", role: "SYSTEM" },
  });

  const ruleSet = await prisma.ruleSet.create({
    data: { version: 1, config: rules, comment: "Initial policy", createdById: admins[0].id, createdAt: new Date(Date.now() - 60 * 86_400_000) },
  });

  for (let i = 1; i <= CASE_COUNT; i++) {
    const r = faker.helpers.weightedArrayElement(REASONS.map((x) => ({ value: x, weight: x.weight })));
    const fixture = DEMO_FIXTURES[i];
    const target = fixture?.target ?? faker.helpers.weightedArrayElement(TARGETS);
    // Cases awaiting four-eyes approval are, by definition, in a four-eyes risk band.
    const riskScore =
      target === "PENDING_APPROVAL" || fixture?.highRisk
        ? faker.number.int({ min: rules.riskThresholds.high, max: 99 })
        : faker.number.int({ min: r.score[0], max: r.score[1] });
    const riskLevel = riskLevelForScore(riskScore, rules.riskThresholds);
    const open = target !== "APPROVED" && target !== "REJECTED";

    const isBusiness = faker.datatype.boolean(0.25);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const customerName = isBusiness ? faker.company.name() : `${firstName} ${lastName}`;
    const createdAt = open ? faker.date.recent({ days: 7 }) : faker.date.recent({ days: 45 });
    const country = faker.helpers.arrayElement(COUNTRIES);

    const created = await prisma.kycCase.create({
      data: {
        caseRef: formatCaseRef(i, createdAt),
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
        dueAt: dueDateFor(rules, riskLevel, createdAt),
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        caseId: created.id, actorId: system.id, action: "CASE_CREATED",
        fromStatus: null, toStatus: "PENDING_REVIEW", note: "Case opened by automated screening.",
        ruleSetVersion: ruleSet.version, createdAt,
      },
    });

    // Replay history through the real workflow rules so seeded data is always consistent.
    const assignee: User = fixture?.assignee !== undefined ? analysts[fixture.assignee] : faker.helpers.arrayElement(analysts);
    const approver: User = faker.helpers.arrayElement(admins);
    const state = {
      status: "PENDING_REVIEW" as CaseStatus,
      assigneeId: null as string | null,
      submittedById: null as string | null,
      recommendation: null as Recommendation | null,
      documentCategories: [] as DocumentCategory[],
      decidedAt: null as Date | null,
    };
    let at = createdAt;
    const tick = () => {
      at = new Date(Math.min(Date.now() - 60_000, at.getTime() + faker.number.int({ min: 1, max: 30 }) * 3_600_000));
      return at;
    };

    for (const step of plan(target, riskLevel)) {
      if (step.kind === "assign") {
        state.assigneeId = assignee.id;
        await prisma.auditEvent.create({
          data: {
            caseId: created.id, actorId: assignee.id, action: "ASSIGN", fromStatus: null, toStatus: state.status,
            note: `Assigned to ${assignee.name}.`, ruleSetVersion: ruleSet.version, createdAt: tick(),
            metadata: { fromAssigneeId: null, toAssigneeId: assignee.id },
          },
        });
      } else if (step.kind === "evidence") {
        for (const category of missingEvidence(rules, r.reason, state.documentCategories)) {
          const bytes = syntheticPdf([
            `SYNTHETIC ${DOCUMENT_CATEGORY_LABELS[category].toUpperCase()}`,
            `Customer: ${customerName}`,
            `Case: ${created.caseRef}`,
            "Generated demo document. Not a real record.",
          ]);
          const storageKey = newStorageKey(created.id);
          await storage.put(storageKey, bytes, "application/pdf");
          const fileName = `${category.toLowerCase().replace(/_/g, "-")}.pdf`;
          const doc = await prisma.caseDocument.create({
            data: {
              caseId: created.id, category, fileName, contentType: "application/pdf", sizeBytes: bytes.length,
              sha256: sha256Hex(bytes), storageKey, uploadedById: assignee.id, createdAt: tick(),
            },
          });
          await prisma.auditEvent.create({
            data: {
              caseId: created.id, actorId: assignee.id, action: "DOCUMENT_UPLOADED", fromStatus: null, toStatus: state.status,
              note: `${DOCUMENT_CATEGORY_LABELS[category]}: ${fileName}`, ruleSetVersion: ruleSet.version, createdAt: at,
              metadata: { documentId: doc.id, sha256: doc.sha256 },
            },
          });
          state.documentCategories.push(category);
        }
      } else {
        const actor = step.by === "approver" ? approver : assignee;
        const decision = evaluateAction({
          kycCase: { ...state, riskLevel, reviewReason: r.reason },
          action: step.action,
          actor: { id: actor.id, role: actor.role as Role },
          rules,
          note: faker.helpers.arrayElement(NOTES[step.action]),
          recommendation: step.recommendation,
        });
        if (!decision.ok) throw new Error(`Seed produced invalid transition (${step.action}): ${decision.message}`);
        await prisma.auditEvent.create({
          data: {
            caseId: created.id, actorId: actor.id, action: step.action, fromStatus: state.status, toStatus: decision.toStatus,
            note: decision.note, ruleSetVersion: ruleSet.version, createdAt: tick(),
            ...(decision.recommendation && { metadata: { recommendation: decision.recommendation } }),
          },
        });
        if (step.action === "SUBMIT_FOR_APPROVAL") {
          state.submittedById = actor.id;
          state.recommendation = decision.recommendation;
        } else if (state.status === "PENDING_APPROVAL") {
          state.submittedById = null;
          state.recommendation = null;
        }
        if (step.action === "APPROVE" || step.action === "REJECT") state.decidedAt = at;
        state.status = decision.toStatus;
      }
    }

    await prisma.kycCase.update({
      where: { id: created.id },
      data: {
        status: state.status,
        assigneeId: state.assigneeId,
        submittedById: state.submittedById,
        recommendation: state.recommendation,
        decidedAt: state.decidedAt,
        updatedAt: at,
      },
    });
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
