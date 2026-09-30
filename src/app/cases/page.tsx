import Link from "next/link";
import { RiskBadge, RiskScore, StatusBadge } from "@/components/Badges";
import { CaseFilters } from "@/components/CaseFilters";
import { formatDate, labelFor } from "@/lib/format";
import { countCasesByStatus, listCases } from "@/lib/kyc/queries";
import { CASE_STATUSES, REVIEW_REASON_LABELS, STATUS_LABELS, isCaseStatus, isRiskLevel } from "@/lib/kyc/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_CARD_ACCENT: Record<string, string> = {
  PENDING_REVIEW: "border-t-blue-500",
  INFO_REQUESTED: "border-t-amber-500",
  APPROVED: "border-t-emerald-500",
  REJECTED: "border-t-rose-500",
};

export default async function CaseQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q)?.trim() || undefined;
  const statusParam = first(params.status);
  const riskParam = first(params.risk);
  const status = isCaseStatus(statusParam) ? statusParam : undefined;
  const riskLevel = isRiskLevel(riskParam) ? riskParam : undefined;

  const [cases, counts] = await Promise.all([listCases({ q, status, riskLevel }), countCasesByStatus()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC Review Queue</h1>
        <p className="text-sm text-slate-500">Customers flagged by automated screening, sorted by risk score.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CASE_STATUSES.map((s) => (
          <Link
            key={s}
            href={status === s ? "/cases" : `/cases?status=${s}`}
            className={`rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm transition hover:shadow ${STATUS_CARD_ACCENT[s]} ${
              status === s ? "ring-2 ring-indigo-500" : ""
            }`}
          >
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{STATUS_LABELS[s]}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{counts[s]}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <CaseFilters q={q} status={status} risk={riskLevel} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2 text-sm text-slate-500">
          {cases.length} {cases.length === 1 ? "case" : "cases"}
        </div>
        {cases.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">No cases match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Risk score</th>
                  <th className="px-4 py-3">Risk level</th>
                  <th className="px-4 py-3">Reason for review</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/cases/${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {c.customerName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{c.caseRef}</span> · {c.customerType === "BUSINESS" ? "Business" : "Individual"} · {c.countryOfResidence}
                      </div>
                    </td>
                    <td className="px-4 py-3"><RiskScore score={c.riskScore} riskLevel={c.riskLevel} /></td>
                    <td className="px-4 py-3"><RiskBadge riskLevel={c.riskLevel} /></td>
                    <td className="px-4 py-3 text-slate-700">{labelFor(REVIEW_REASON_LABELS, c.reviewReason)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(c.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/cases/${c.id}`}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:text-indigo-600"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
