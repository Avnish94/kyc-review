import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CASE_STATUSES, OPEN_STATUSES, type CaseStatus, type RiskLevel } from "@/lib/kyc/types";

export const QUEUE_SCOPES = ["all", "mine", "unassigned", "approvals", "overdue"] as const;
export type QueueScope = (typeof QUEUE_SCOPES)[number];

export type CaseFilters = {
  q?: string;
  status?: CaseStatus;
  riskLevel?: RiskLevel;
  scope?: QueueScope;
};

function scopeWhere(scope: QueueScope | undefined, userId: string): Prisma.KycCaseWhereInput {
  switch (scope) {
    case "mine":
      return { assigneeId: userId, status: { in: [...OPEN_STATUSES] } };
    case "unassigned":
      return { assigneeId: null, status: { in: [...OPEN_STATUSES] } };
    case "approvals":
      return { status: "PENDING_APPROVAL", submittedById: { not: userId } };
    case "overdue":
      return { status: { in: [...OPEN_STATUSES] }, dueAt: { lt: new Date() } };
    default:
      return {};
  }
}

export async function listCases(filters: CaseFilters, userId: string) {
  const q = filters.q?.trim();
  const where: Prisma.KycCaseWhereInput = {
    AND: [
      scopeWhere(filters.scope, userId),
      {
        ...(filters.status && { status: filters.status }),
        ...(filters.riskLevel && { riskLevel: filters.riskLevel }),
        ...(q && {
          OR: [
            { customerName: { contains: q, mode: "insensitive" } },
            { caseRef: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }),
      },
    ],
  };

  return prisma.kycCase.findMany({
    where,
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      caseRef: true,
      customerName: true,
      customerType: true,
      countryOfResidence: true,
      riskScore: true,
      riskLevel: true,
      reviewReason: true,
      status: true,
      dueAt: true,
      updatedAt: true,
      assignee: { select: { name: true } },
    },
  });
}

export async function countCasesByStatus(): Promise<Record<CaseStatus, number>> {
  const groups = await prisma.kycCase.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}

export async function countScopes(userId: string): Promise<Record<QueueScope, number>> {
  const [all, mine, unassigned, approvals, overdue] = await Promise.all(
    QUEUE_SCOPES.map((s) => prisma.kycCase.count({ where: scopeWhere(s, userId) })),
  );
  return { all, mine, unassigned, approvals, overdue };
}

export async function getCaseDetail(id: string) {
  return prisma.kycCase.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, role: true } } },
      },
    },
  });
}

export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { active: true, role: { in: ["ANALYST", "ADMIN"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, role: true },
  });
}
