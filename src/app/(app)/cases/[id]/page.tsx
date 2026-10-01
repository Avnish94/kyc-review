import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel, type ActionOption } from "@/components/ActionPanel";
import { AssignmentPanel } from "@/components/AssignmentPanel";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DueBadge, RiskBadge, RiskScore, StatusBadge } from "@/components/Badges";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { canAssign, canPerformAction } from "@/lib/authz";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { canUploadDocument } from "@/lib/documents/service";
import { ACCEPTED_EXTENSIONS } from "@/lib/documents/validation";
import { formatBytes, formatCurrency, formatDate, formatDateTime, labelFor } from "@/lib/format";
import { getCaseDetail, listAssignableUsers } from "@/lib/kyc/queries";
import { ACTION_LABELS, RECOMMENDATION_LABELS, REVIEW_REASON_LABELS, isOpenStatus } from "@/lib/kyc/types";
import { MAX_NOTE_LENGTH, availableActions } from "@/lib/kyc/workflow";
import { getActiveRules } from "@/lib/rules/store";

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
  const [user, kycCase, rules] = await Promise.all([requireUser(), getCaseDetail(id), getActiveRules(prisma)]);
  if (!kycCase) notFound();

  const actor = { id: user.id, role: user.role };
  const riskLevel = kycCase.riskLevel;
  const options: ActionOption[] = availableActions(kycCase, rules.config).map((action) => {
    const authz = canPerformAction(actor, action, kycCase, rules.config);
    return {
      action,
      label: ACTION_LABELS[action],
      allowed: authz.allowed,
      reason: authz.allowed ? undefined : authz.reason,
      noteRequired: rules.config.notesRequired[action],
    };
  });

  const open = isOpenStatus(kycCase.status);
  const assignableUsers = user.role === "ADMIN" && open ? await listAssignableUsers() : undefined;
  const uploadAuthz = canUploadDocument(actor, kycCase);
  const uploaded = kycCase.documents.map((d) => d.category);
  const required = rules.config.requiredEvidence[kycCase.reviewReason].map((category) => ({
    category,
    present: uploaded.includes(category),
  }));
  const isBusiness = kycCase.customerType === "BUSINESS";
  const now = new Date();

  return (
    <div className="space-y-6">
      <Link href="/cases" className="text-sm text-slate-600 hover:text-indigo-600">← Back to queue</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-slate-500">{kycCase.caseRef}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{kycCase.customerName}</h1>
          <p className="text-sm text-slate-500">
            {isBusiness ? "Business" : "Individual"} customer · opened {formatDateTime(kycCase.createdAt)}
            {kycCase.source === "SCREENING_WEBHOOK" && " · via screening webhook"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DueBadge dueAt={kycCase.dueAt} status={kycCase.status} now={now} />
          <RiskBadge riskLevel={riskLevel} />
          <StatusBadge status={kycCase.status} />
        </div>
      </div>

      {kycCase.status === "PENDING_APPROVAL" && kycCase.submittedBy && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <span className="font-medium">{kycCase.submittedBy.name}</span> submitted this case for four-eyes approval
          {kycCase.recommendation && (
            <> with <span className="font-medium">{RECOMMENDATION_LABELS[kycCase.recommendation].toLowerCase()}</span></>
          )}
          . A different Admin must approve, reject or send it back.
        </div>
      )}

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
              <Field label="Expected monthly volume">
                {kycCase.expectedMonthlyVolume ? formatCurrency(kycCase.expectedMonthlyVolume) : "—"}
              </Field>
              <Field label="Email">{kycCase.email}</Field>
              <Field label="Phone">{kycCase.phone}</Field>
              <div className="sm:col-span-2">
                <Field label="Address">{kycCase.address}</Field>
              </div>
              <Field label="ID document type">{kycCase.documentType}</Field>
              <Field label="ID document number">
                <span className="font-mono">{kycCase.documentNumber}</span>
              </Field>
            </dl>
          </section>

          <DocumentsPanel
            caseId={kycCase.id}
            documents={kycCase.documents.map((d) => ({
              id: d.id,
              category: d.category,
              fileName: d.fileName,
              size: formatBytes(d.sizeBytes),
              uploadedBy: d.uploadedBy.name,
              uploadedAt: formatDateTime(d.createdAt),
            }))}
            required={required}
            evidenceBlocksApproval={rules.config.requireEvidenceToApprove}
            canUpload={uploadAuthz.allowed}
            uploadBlockedReason={uploadAuthz.allowed ? undefined : uploadAuthz.reason}
            accept={ACCEPTED_EXTENSIONS.join(",")}
          />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <AssignmentPanel
            key={`assign-${kycCase.assigneeId}`}
            caseId={kycCase.id}
            assignee={kycCase.assignee}
            canClaim={kycCase.assigneeId !== user.id && canAssign(actor, kycCase, user.id).allowed}
            canUnassign={kycCase.assigneeId !== null && canAssign(actor, kycCase, null).allowed}
            assignableUsers={assignableUsers}
            closed={!open}
          />
          <ActionPanel
            key={kycCase.id}
            caseId={kycCase.id}
            status={kycCase.status}
            options={options}
            maxNoteLength={MAX_NOTE_LENGTH}
          />
          <AuditTimeline events={kycCase.auditEvents} />
          <p className="text-xs text-slate-400">
            Evaluated against rule set v{rules.version}. SLA due {formatDateTime(kycCase.dueAt)}.
          </p>
        </div>
      </div>
    </div>
  );
}
