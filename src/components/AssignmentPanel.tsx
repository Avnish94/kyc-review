"use client";

import { useActionState } from "react";
import { assignCaseAction, type FormState } from "@/app/(app)/cases/[id]/actions";

type Props = {
  caseId: string;
  assignee: { id: string; name: string } | null;
  canClaim: boolean;
  canUnassign: boolean;
  /** Present only for users allowed to assign cases to others. */
  assignableUsers?: { id: string; name: string; role: string }[];
  closed: boolean;
};

export function AssignmentPanel({ caseId, assignee, canClaim, canUnassign, assignableUsers, closed }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(assignCaseAction, {});

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Assignment</h2>
      <p className="mt-2 text-sm">
        {assignee ? (
          <>Assigned to <span className="font-medium" data-testid="assignee-name">{assignee.name}</span></>
        ) : (
          <span className="text-slate-500">Unassigned</span>
        )}
      </p>
      {!closed && (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="expectedAssigneeId" value={assignee?.id ?? ""} />
          <div className="flex flex-wrap gap-2">
            {canClaim && (
              <button
                type="submit" name="intent" value="claim" disabled={pending}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                Assign to me
              </button>
            )}
            {canUnassign && (
              <button
                type="submit" name="intent" value="unassign" disabled={pending}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Unassign
              </button>
            )}
          </div>
          {assignableUsers && (
            <div className="flex gap-2">
              <label htmlFor="assigneeId" className="sr-only">Assign to</label>
              <select
                id="assigneeId" name="assigneeId" defaultValue=""
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>Assign to…</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role === "ADMIN" ? "Admin" : "Analyst"})</option>
                ))}
              </select>
              <button
                type="submit" name="intent" value="assign" disabled={pending}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          )}
          {state.message && (
            <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>
          )}
        </form>
      )}
    </section>
  );
}
