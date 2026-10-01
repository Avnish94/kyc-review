"use client";

import Link from "next/link";
import { RISK_LABELS, RISK_LEVELS, STATUS_LABELS, CASE_STATUSES } from "@/lib/kyc/types";

type Props = { q?: string; status?: string; risk?: string; scope?: string };

const control =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none";

export function CaseFilters({ q, status, risk, scope }: Props) {
  const hasFilters = Boolean(q || status || risk);
  const clearHref = scope && scope !== "all" ? `/cases?scope=${scope}` : "/cases";

  return (
    <form
      method="get"
      action="/cases"
      key={`${q}|${status}|${risk}|${scope}`}
      className="flex flex-wrap items-end gap-3"
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {scope && scope !== "all" && <input type="hidden" name="scope" value={scope} />}
      <div className="min-w-64 flex-1">
        <label htmlFor="q" className="block text-xs font-medium text-slate-600">Search</label>
        <input
          id="q" name="q" type="search" defaultValue={q}
          placeholder="Customer name, case ref or email — press Enter"
          className={`${control} mt-1 w-full`}
        />
      </div>
      <div>
        <label htmlFor="status" className="block text-xs font-medium text-slate-600">Status</label>
        <select id="status" name="status" defaultValue={status ?? ""} className={`${control} mt-1`}>
          <option value="">All statuses</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="risk" className="block text-xs font-medium text-slate-600">Risk level</label>
        <select id="risk" name="risk" defaultValue={risk ?? ""} className={`${control} mt-1`}>
          <option value="">All risk levels</option>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>{RISK_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">
        Search
      </button>
      {hasFilters && (
        <Link href={clearHref} className="px-2 py-2 text-sm text-slate-600 hover:text-slate-900">
          Clear
        </Link>
      )}
    </form>
  );
}
