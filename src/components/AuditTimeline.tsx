import { StatusBadge } from "@/components/Badges";
import { formatDateTime, labelFor } from "@/lib/format";
import { AUDIT_ACTION_LABELS, RECOMMENDATION_LABELS, ROLE_LABELS } from "@/lib/kyc/types";

type AuditEntry = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  ruleSetVersion: number | null;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string; role: string };
};

function recommendationOf(metadata: unknown): string | null {
  if (typeof metadata === "object" && metadata !== null && "recommendation" in metadata) {
    const r = (metadata as { recommendation: unknown }).recommendation;
    return typeof r === "string" ? labelFor(RECOMMENDATION_LABELS, r) : null;
  }
  return null;
}

export function AuditTimeline({ events }: { events: AuditEntry[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Audit history</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No audit events.</p>
      ) : (
        <ol className="mt-4 space-y-5 border-l border-slate-200 pl-5" data-testid="audit-timeline">
          {events.map((e) => {
            const statusChange = e.fromStatus !== null || e.action === "CASE_CREATED";
            const recommendation = recommendationOf(e.metadata);
            return (
              <li key={e.id} className="relative">
                <span
                  className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4 ring-white ${statusChange ? "bg-indigo-500" : "bg-slate-300"}`}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{labelFor(AUDIT_ACTION_LABELS, e.action)}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-700">{e.actor.name}</span>
                  <span className="text-xs text-slate-500">({labelFor(ROLE_LABELS, e.actor.role)})</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {statusChange && (
                    <>
                      {e.fromStatus && (
                        <>
                          <StatusBadge status={e.fromStatus} />
                          <span aria-hidden>→</span>
                        </>
                      )}
                      <StatusBadge status={e.toStatus} />
                    </>
                  )}
                  <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
                  {e.ruleSetVersion !== null && <span className="text-slate-400">· rules v{e.ruleSetVersion}</span>}
                </div>
                {recommendation && <p className="mt-1 text-xs font-medium text-violet-700">{recommendation}</p>}
                {e.note && <p className="mt-1.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
