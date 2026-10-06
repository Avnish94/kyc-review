import { requireAdmin } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getActiveRules, listRuleSetVersions } from "@/lib/rules/store";
import { RulesEditor } from "./RulesEditor";

export default async function RulesPage() {
  await requireAdmin();
  const [active, versions] = await Promise.all([getActiveRules(prisma), listRuleSetVersions(prisma)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review rules</h1>
        <p className="text-sm text-slate-500">
          Active version: <span className="font-medium text-slate-700">v{active.version}</span>. Publishing creates a new immutable
          version; every audit record stores the version it was decided under. Changes do not re-score or re-date existing cases.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <RulesEditor config={active.config} version={active.version} />
        </div>
        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Version history</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                <div className="font-medium">
                  v{v.version} {v.version === active.version && <span className="ml-1 rounded bg-emerald-50 px-1.5 text-xs text-emerald-700">active</span>}
                </div>
                <div className="text-xs text-slate-500">{v.createdBy.name} · {formatDateTime(v.createdAt)}</div>
                {v.comment && <p className="mt-0.5 text-slate-700">{v.comment}</p>}
              </li>
            ))}
            {versions.length === 0 && <li className="text-slate-500">Using built-in defaults (v0).</li>}
          </ol>
        </aside>
      </div>
    </div>
  );
}
