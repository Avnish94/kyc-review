import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CASE_STATUSES, type CaseStatus, type RiskLevel } from "@/lib/kyc/types";

export type CaseFilters = {
  q?: string;
  status?: CaseStatus;
  riskLevel?: RiskLevel;
};

export async function listCases(filters: CaseFilters) {
  const q = filters.q?.trim();
  const where: Prisma.KycCaseWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.riskLevel && { riskLevel: filters.riskLevel }),
    ...(q && {
      OR: [
        { customerName: { contains: q } },
        { caseRef: { contains: q } },
        { email: { contains: q } },
      ],
    }),
  };

  return prisma.kycCase.findMany({
    where,
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
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
      updatedAt: true,
    },
  });
}

export async function countCasesByStatus(): Promise<Record<CaseStatus, number>> {
  const groups = await prisma.kycCase.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
  for (const g of groups) {
    if (g.status in counts) counts[g.status as CaseStatus] = g._count._all;
  }
  return counts;
}

export async function getCaseWithAudit(id: string) {
  return prisma.kycCase.findUnique({
    where: { id },
    include: {
      auditEvents: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, role: true } } },
      },
    },
  });
}
