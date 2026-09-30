import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel, type ActionOption } from "@/components/ActionPanel";
import { AuditTimeline } from "@/components/AuditTimeline";
import { RiskBadge, RiskScore, StatusBadge } from "@/components/Badges";
import { canPerformAction } from "@/lib/authz";
import { requireUser } from "@/lib/auth/current-user";
import { formatCurrency, formatDate, formatDateTime, labelFor } from "@/lib/format";
import { getCaseWithAudit } from "@/lib/kyc/queries";
import { ACTION_LABELS, REVIEW_REASON_LABELS, isCaseStatus, isRiskLevel } from "@/lib/kyc/types";
import { MAX_NOTE_LENGTH, TRANSITIONS, actionsForStatus } from "@/lib/kyc/workflow";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, kycCase] = await Promise.all([requireUser(), getCaseWithAudit(id)]);
  if (!kycCase || !isCaseStatus(kycCase.status) || !isRiskLevel(kycCase.riskLevel)) notFound();

  const riskLevel = kycCase.riskLevel;
  const options: ActionOption[] = actionsForStatus(kycCase.status).map((action) => {
    const authz = canPerformAction(user.role, action, riskLevel);
    return {
      action,
      label: ACTION_LABELS[action],
      allowed: authz.allowed,
      reason: authz.allowed ? undefined : authz.reason,
      noteRequired: TRANSITIONS[action].noteRequired,
    };
  });

  const isBusiness = kycCase.customerType === "BUSINESS";

  return (
    <div className="space-y-6">
      <Link href="/cases" className="text-sm text-slate-600 hover:text-indigo-600">← Back to queue</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-slate-500">{kycCase.caseRef}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{kycCase.customerName}</h1>
          <p className="text-sm text-slate-500">
            {isBusiness ? "Business" : "Individual"} customer · opened {formatDateTime(kycCase.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge riskLevel={riskLevel} />
          <StatusBadge status={kycCase.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="rounded-lg border border-red-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Reason for review</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="text-lg font-medium">{labelFor(REVIEW_REASON_LABELS, kycCase.reviewReason)}</div>
              <RiskScore score={kycCase.riskScore} riskLevel={riskLevel} />
            </div>
            <p className="mt-2 text-sm text-slate-700">{kycCase.reasonDetail}</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Customer information</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={isBusiness ? "Registered name" : "Full name"}>{kycCase.customerName}</Field>
              {isBusiness ? (
                <Field label="Incorporation date">
                  {kycCase.incorporationDate ? formatDate(kycCase.incorporationDate) : "—"}
                </Field>
              ) : (
                <Field label="Date of birth">{kycCase.dateOfBirth ? formatDate(kycCase.dateOfBirth) : "—"}</Field>
              )}
              <Field label={isBusiness ? "Country of incorporation" : "Nationality"}>{kycCase.nationality}</Field>
              <Field label="Country of residence">{kycCase.countryOfResidence}</Field>
              <Field label={isBusiness ? "Industry" : "Occupation"}>{kycCase.occupation}</Field>
              <Field label="Expected monthly volume">{formatCurrency(kycCase.expectedMonthlyVolume)}</Field>
              <Field label="Email">{kycCase.email}</Field>
              <Field label="Phone">{kycCase.phone}</Field>
              <div className="sm:col-span-2">
                <Field label="Address">{kycCase.address}</Field>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">KYC documents</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Document type">{kycCase.documentType}</Field>
              <Field label="Document number">
                <span className="font-mono">{kycCase.documentNumber}</span>
              </Field>
            </dl>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <ActionPanel
            key={kycCase.id}
            caseId={kycCase.id}
            status={kycCase.status}
            options={options}
            maxNoteLength={MAX_NOTE_LENGTH}
          />
          <AuditTimeline events={kycCase.auditEvents} />
        </div>
      </div>
    </div>
  );
}
