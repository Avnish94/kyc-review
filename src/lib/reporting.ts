import type { PrismaClient } from "@prisma/client";
import { OPEN_STATUSES } from "@/lib/kyc/types";

const DAY = 86_400_000;

export const AGING_BUCKETS = [
  { label: "< 1 day", maxDays: 1 },
  { label: "1–3 days", maxDays: 3 },
  { label: "3–7 days", maxDays: 7 },
  { label: "> 7 days", maxDays: Infinity },
] as const;

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

/** Operational metrics. Aggregates in the database where Prisma supports it. */
export async function getDashboardMetrics(db: PrismaClient, now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since14 = new Date(now.getTime() - 13 * DAY);
  since14.setUTCHours(0, 0, 0, 0);

  const [openCases, decided30, decisions, byRisk] = await Promise.all([
    db.kycCase.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
      select: { createdAt: true, dueAt: true, status: true },
    }),
    db.kycCase.findMany({
      where: { decidedAt: { gte: since30 } },
      select: { createdAt: true, decidedAt: true, dueAt: true },
    }),
    db.auditEvent.findMany({
      where: { action: { in: ["APPROVE", "REJECT"] }, createdAt: { gte: since30 } },
      select: { action: true, createdAt: true, actor: { select: { name: true } } },
    }),
    db.kycCase.groupBy({ by: ["riskLevel"], where: { status: { in: [...OPEN_STATUSES] } }, _count: { _all: true } }),
  ]);

  const ageDays = (d: Date) => (now.getTime() - d.getTime()) / DAY;
  const aging = AGING_BUCKETS.map((b, i) => ({
    label: b.label,
    count: openCases.filter((c) => {
      const a = ageDays(c.createdAt);
      return a < b.maxDays && (i === 0 || a >= AGING_BUCKETS[i - 1].maxDays);
    }).length,
  }));

  const overdue = openCases.filter((c) => c.dueAt < now).length;
  const onTime = decided30.filter((c) => c.decidedAt && c.decidedAt <= c.dueAt).length;
  const avgHoursToDecision =
    decided30.length === 0
      ? null
      : decided30.reduce((s, c) => s + (c.decidedAt!.getTime() - c.createdAt.getTime()), 0) / decided30.length / 3_600_000;

  const throughput = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(since14.getTime() + i * DAY);
    const next = day.getTime() + DAY;
    const inDay = decisions.filter((d) => d.createdAt.getTime() >= day.getTime() && d.createdAt.getTime() < next);
    return {
      day: day.toISOString().slice(5, 10),
      approved: inDay.filter((d) => d.action === "APPROVE").length,
      rejected: inDay.filter((d) => d.action === "REJECT").length,
    };
  });

  const reviewerMap = new Map<string, { approved: number; rejected: number }>();
  for (const d of decisions) {
    const r = reviewerMap.get(d.actor.name) ?? { approved: 0, rejected: 0 };
    if (d.action === "APPROVE") r.approved++;
    else r.rejected++;
    reviewerMap.set(d.actor.name, r);
  }
  const reviewers = [...reviewerMap.entries()]
    .map(([name, r]) => ({ name, ...r, total: r.approved + r.rejected }))
    .sort((a, b) => b.total - a.total);

  return {
    open: openCases.length,
    overdue,
    awaitingApproval: openCases.filter((c) => c.status === "PENDING_APPROVAL").length,
    decided30: decided30.length,
    slaCompliance30: decided30.length === 0 ? null : onTime / decided30.length,
    avgHoursToDecision,
    aging,
    throughput,
    reviewers,
    openByRisk: Object.fromEntries(byRisk.map((g) => [g.riskLevel, g._count._all])) as Partial<Record<string, number>>,
  };
}

/** CSV cell escaping, including protection against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
