"use client";

import { useActionState, useRef } from "react";
import { uploadDocumentAction, type FormState } from "@/app/(app)/cases/[id]/actions";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from "@/lib/kyc/types";

type Doc = {
  id: string;
  category: DocumentCategory;
  fileName: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
};

type Props = {
  caseId: string;
  documents: Doc[];
  required: { category: DocumentCategory; present: boolean }[];
  evidenceBlocksApproval: boolean;
  canUpload: boolean;
  uploadBlockedReason?: string;
  accept: string;
};

export function DocumentsPanel({ caseId, documents, required, evidenceBlocksApproval, canUpload, uploadBlockedReason, accept }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await uploadDocumentAction(prev, fd);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});
  const missing = required.filter((r) => !r.present);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Evidence</h2>

      {required.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-medium text-slate-500">Required for this review reason</h3>
          <ul className="mt-1.5 flex flex-wrap gap-2" data-testid="evidence-checklist">
            {required.map((r) => (
              <li
                key={r.category}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  r.present ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-50 text-slate-600 ring-slate-400/30"
                }`}
              >
                {r.present ? "✓" : "○"} {DOCUMENT_CATEGORY_LABELS[r.category]}
              </li>
            ))}
          </ul>
          {missing.length > 0 && evidenceBlocksApproval && (
            <p className="mt-1.5 text-xs text-amber-700">Approval is blocked until all required evidence is uploaded.</p>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No documents uploaded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="font-medium text-indigo-700 hover:underline">
                  {d.fileName}
                </a>
                <div className="text-xs text-slate-500">
                  {DOCUMENT_CATEGORY_LABELS[d.category]} · {d.size} · {d.uploadedBy} · {d.uploadedAt}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload ? (
        <form ref={formRef} action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="caseId" value={caseId} />
          <div>
            <label htmlFor="category" className="block text-xs font-medium text-slate-600">Document type</label>
            <select
              id="category" name="category" required defaultValue={missing[0]?.category ?? ""}
              className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="" disabled>Choose…</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="file" className="block text-xs font-medium text-slate-600">File (PDF, PNG or JPEG, max 10 MB)</label>
            <input id="file" name="file" type="file" required accept={accept} className="mt-1 block w-full text-sm" />
          </div>
          <button
            type="submit" disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Upload"}
          </button>
          {state.message && (
            <p role="status" className={`w-full text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>
          )}
        </form>
      ) : (
        uploadBlockedReason && <p className="mt-3 text-xs text-slate-500">{uploadBlockedReason}</p>
      )}
    </section>
  );
}
