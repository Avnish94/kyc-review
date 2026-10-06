import Link from "next/link";
import { canExportData } from "@/lib/authz";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { RISK_LABELS, RISK_LEVELS } from "@/lib/kyc/types";
import { getDashboardMetrics } from "@/lib/reporting";
import { ExportButtons } from "./ExportButtons";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, href, tone }: { label: string; value: string; hint?: string; href?: string; tone?: "bad" }) {
  const body = (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${tone === "bad" ? "border-red-200" : "border-slate-200"}`}>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-red-700" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

const card = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const h2 = "text-sm font-semibold tracking-wide text-slate-500 uppercase";

export default async function DashboardPage() {
  const user = await requireUser();
  const m = await getDashboardMetrics(prisma);
  const maxAging = Math.max(1, ...m.aging.map((a) => a.count));
  const maxDay = Math.max(1, ...m.throughput.map((d) => d.approved + d.rejected));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations dashboard</h1>
          <p className="text-sm text-slate-500">Workload, SLA and throughput across the review team.</p>
        </div>
        {canExportData(user.role) && (
          <ExportButtons />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open cases" value={String(m.open)} href="/cases?scope=all" />
        <Stat label="Overdue" value={String(m.overdue)} tone={m.overdue > 0 ? "bad" : undefined} href="/cases?scope=overdue" />
        <Stat label="Awaiting approval" value={String(m.awaitingApproval)} href="/cases?status=PENDING_APPROVAL" />
        <Stat
          label="SLA met (30d)"
          value={m.slaCompliance30 === null ? "—" : `${Math.round(m.slaCompliance30 * 100)}%`}
          hint={`${m.decided30} decisions`}
        />
        <Stat
          label="Avg time to decision"
          value={m.avgHoursToDecision === null ? "—" : m.avgHoursToDecision < 48 ? `${m.avgHoursToDecision.toFixed(0)}h` : `${(m.avgHoursToDecision / 24).toFixed(1)}d`}
          hint="last 30 days"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={card}>
          <h2 className={h2}>Open case aging</h2>
          <ul className="mt-4 space-y-2">
            {m.aging.map((a) => (
              <li key={a.label} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-slate-600">{a.label}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div className="h-3 rounded bg-indigo-500" style={{ width: `${(a.count / maxAging) * 100}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums">{a.count}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-xs font-medium text-slate-500">Open by risk</h3>
          <div className="mt-1 flex gap-4 text-sm">
            {RISK_LEVELS.map((r) => (
              <span key={r}>{RISK_LABELS[r]}: <span className="font-semibold tabular-nums">{m.openByRisk[r] ?? 0}</span></span>
            ))}
          </div>
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h2 className={h2}>Decisions per day (14 days)</h2>
          <div className="mt-4 flex h-40 items-end gap-1.5">
            {m.throughput.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.approved} approved, ${d.rejected} rejected`}>
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div className="w-full bg-rose-400" style={{ height: `${(d.rejected / maxDay) * 100}%` }} />
                  <div className="w-full rounded-t-none bg-emerald-500" style={{ height: `${(d.approved / maxDay) * 100}%` }} />
                </div>
                <span className="text-[10px] text-slate-500">{d.day}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-600">
            <span><span className="mr-1 inline-block h-2 w-2 bg-emerald-500" />Approved</span>
            <span><span className="mr-1 inline-block h-2 w-2 bg-rose-400" />Rejected</span>
          </div>
        </section>
      </div>

      <section className={card}>
        <h2 className={h2}>Reviewer decisions (30 days)</h2>
        {m.reviewers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No decisions yet.</p>
        ) : (
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="py-1">Reviewer</th><th>Approved</th><th>Rejected</th><th>Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {m.reviewers.map((r) => (
                <tr key={r.name}>
                  <td className="py-1.5 font-medium">{r.name}</td>
                  <td className="tabular-nums">{r.approved}</td>
                  <td className="tabular-nums">{r.rejected}</td>
                  <td className="tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
