"use client";

import { useActionState } from "react";
import { submitCaseAction, type ActionFormState } from "@/app/cases/[id]/actions";
import type { CaseAction, CaseStatus } from "@/lib/kyc/types";

export type ActionOption = {
  action: CaseAction;
  label: string;
  allowed: boolean;
  reason?: string;
  noteRequired: boolean;
};

type Props = {
  caseId: string;
  status: CaseStatus;
  options: ActionOption[];
  maxNoteLength: number;
};

const BUTTON_STYLES: Record<CaseAction, string> = {
  APPROVE: "bg-emerald-600 text-white hover:bg-emerald-500",
  REJECT: "bg-rose-600 text-white hover:bg-rose-500",
  REQUEST_INFO: "bg-amber-500 text-white hover:bg-amber-400",
  MARK_INFO_RECEIVED: "bg-indigo-600 text-white hover:bg-indigo-500",
  REOPEN: "bg-slate-700 text-white hover:bg-slate-600",
};

export function ActionPanel({ caseId, status, options, maxNoteLength }: Props) {
  const [state, formAction, pending] = useActionState<ActionFormState, FormData>(submitCaseAction, {});
  const blocked = options.filter((o) => !o.allowed);
  const requiresNote = options.filter((o) => o.allowed && o.noteRequired).map((o) => o.label);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Review decision</h2>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No actions are available for this case.</p>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="expectedStatus" value={status} />
          <div>
            <label htmlFor="note" className="block text-sm font-medium text-slate-700">Reviewer note</label>
            <textarea
              id="note" name="note" rows={3} maxLength={maxNoteLength}
              placeholder="Explain the decision or what information is needed…"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
            {requiresNote.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">Required for: {requiresNote.join(", ")}.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.action}
                type="submit"
                name="action"
                value={o.action}
                disabled={!o.allowed || pending}
                title={o.reason}
                className={`rounded-md px-3 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_STYLES[o.action]}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {blocked.length > 0 && (
            <ul className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {blocked.map((o) => (
                <li key={o.action}>
                  <span className="font-medium">{o.label}:</span> {o.reason}
                </li>
              ))}
            </ul>
          )}
          {state.message && (
            <p
              role="status"
              className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
            >
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
