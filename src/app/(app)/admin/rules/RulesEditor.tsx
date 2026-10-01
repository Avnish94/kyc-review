"use client";

import { useActionState } from "react";
import {
  ACTION_LABELS,
  CASE_ACTIONS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  REVIEW_REASONS,
  REVIEW_REASON_LABELS,
  RISK_LABELS,
  RISK_LEVELS,
} from "@/lib/kyc/types";
import type { RuleSetConfig } from "@/lib/rules/config";
import { publishRulesAction, type RulesFormState } from "./actions";

const num = "w-24 rounded-md border border-slate-300 px-2 py-1 text-sm";
const card = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const h2 = "text-sm font-semibold tracking-wide text-slate-500 uppercase";

export function RulesEditor({ config, version }: { config: RuleSetConfig; version: number }) {
  const [state, action, pending] = useActionState<RulesFormState, FormData>(publishRulesAction, {});

  return (
    <form action={action} key={version} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <section className={card}>
          <h2 className={h2}>Risk thresholds</h2>
          <p className="mt-1 text-xs text-slate-500">Applied to new cases when their screening score is converted to a risk level.</p>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <label className="space-y-1">
              <span className="block text-slate-700">Medium from score</span>
              <input name="threshold.medium" type="number" min={1} max={99} defaultValue={config.riskThresholds.medium} className={num} />
            </label>
            <label className="space-y-1">
              <span className="block text-slate-700">High from score</span>
              <input name="threshold.high" type="number" min={2} max={100} defaultValue={config.riskThresholds.high} className={num} />
            </label>
          </div>
        </section>

        <section className={card}>
          <h2 className={h2}>Approval matrix & SLA</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Risk</th>
                <th className="py-1">Analyst may decide</th>
                <th className="py-1">Four-eyes approval</th>
                <th className="py-1">SLA (hours)</th>
              </tr>
            </thead>
            <tbody>
              {RISK_LEVELS.map((l) => (
                <tr key={l}>
                  <td className="py-1.5 font-medium">{RISK_LABELS[l]}</td>
                  <td><input type="checkbox" name={`analyst.${l}`} defaultChecked={config.analystDecisionRiskLevels.includes(l)} aria-label={`Analyst may decide ${l}`} /></td>
                  <td><input type="checkbox" name={`fourEyes.${l}`} defaultChecked={config.fourEyesRiskLevels.includes(l)} aria-label={`Four-eyes ${l}`} /></td>
                  <td><input name={`sla.${l}`} type="number" min={1} max={2160} defaultValue={config.slaHours[l]} className={num} aria-label={`SLA hours ${l}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Four-eyes risk levels must be submitted for approval and decided by a different Admin.
          </p>
        </section>
      </div>

      <section className={card}>
        <h2 className={h2}>Notes required</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {CASE_ACTIONS.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" name={`note.${a}`} defaultChecked={config.notesRequired[a]} />
              {ACTION_LABELS[a]}
            </label>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>Required evidence by review reason</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireEvidenceToApprove" defaultChecked={config.requireEvidenceToApprove} />
            Block approval until required evidence is uploaded
          </label>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4">Reason</th>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <th key={c} className="px-2 py-1 text-center">{DOCUMENT_CATEGORY_LABELS[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {REVIEW_REASONS.map((r) => (
                <tr key={r}>
                  <td className="py-1.5 pr-4 font-medium whitespace-nowrap">{REVIEW_REASON_LABELS[r]}</td>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <td key={c} className="text-center">
                      <input
                        type="checkbox"
                        name={`evidence.${r}.${c}`}
                        defaultChecked={config.requiredEvidence[r].includes(c)}
                        aria-label={`${REVIEW_REASON_LABELS[r]} requires ${DOCUMENT_CATEGORY_LABELS[c]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <label htmlFor="comment" className="block text-sm font-medium text-slate-700">Change description (recorded with the new version)</label>
        <input id="comment" name="comment" required maxLength={500} placeholder="e.g. Tighten SLA for high-risk cases per compliance memo 2026-14" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
            {pending ? "Publishing…" : `Publish as v${version + 1}`}
          </button>
          {state.message && (
            <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>
          )}
        </div>
        {state.errors && (
          <ul className="mt-2 list-disc pl-5 text-sm text-rose-700">
            {state.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </section>
    </form>
  );
}
