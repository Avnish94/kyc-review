import { labelFor } from "@/lib/format";
import { RISK_LABELS, STATUS_LABELS } from "@/lib/kyc/types";

const STATUS_STYLES: Record<string, string> = {
  PENDING_REVIEW: "bg-blue-50 text-blue-700 ring-blue-600/20",
  INFO_REQUESTED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 ring-slate-500/20",
  MEDIUM: "bg-orange-50 text-orange-700 ring-orange-600/20",
  HIGH: "bg-red-100 text-red-800 ring-red-600/30",
};

const base = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`${base} ${STATUS_STYLES[status] ?? ""}`}>{labelFor(STATUS_LABELS, status)}</span>;
}

export function RiskBadge({ riskLevel }: { riskLevel: string }) {
  return <span className={`${base} ${RISK_STYLES[riskLevel] ?? ""}`}>{labelFor(RISK_LABELS, riskLevel)} risk</span>;
}

const SCORE_BAR: Record<string, string> = { LOW: "bg-slate-400", MEDIUM: "bg-orange-500", HIGH: "bg-red-600" };

export function RiskScore({ score, riskLevel }: { score: number; riskLevel: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-right font-mono text-sm tabular-nums">{score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className={`h-full ${SCORE_BAR[riskLevel] ?? "bg-slate-400"}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
