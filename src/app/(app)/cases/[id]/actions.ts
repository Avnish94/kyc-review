"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { uploadDocument } from "@/lib/documents/service";
import { getStorage } from "@/lib/documents/storage";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/validation";
import { assignCase, performCaseAction } from "@/lib/kyc/service";
import { STATUS_LABELS, isCaseAction, isCaseStatus, isDocumentCategory, isRecommendation } from "@/lib/kyc/types";
import { dispatchOutbox } from "@/lib/notifications";

export type FormState = { ok?: boolean; message?: string };

function refresh(caseId: string) {
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export async function submitCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const caseId = formData.get("caseId");
  const action = formData.get("action");
  const expectedStatus = formData.get("expectedStatus");
  const note = formData.get("note");
  const recommendation = formData.get("recommendation");

  if (typeof caseId !== "string" || !isCaseAction(action) || !isCaseStatus(expectedStatus)) {
    return { ok: false, message: "Invalid request." };
  }

  const result = await performCaseAction(prisma, {
    caseId,
    action,
    expectedStatus,
    note: typeof note === "string" ? note : null,
    recommendation: isRecommendation(recommendation) ? recommendation : null,
    actor: { id: user.id, role: user.role },
  });

  if (!result.ok) return { ok: false, message: result.message };

  await dispatchOutbox(prisma).catch((err) => console.error("Outbox dispatch failed", err));
  refresh(caseId);
  return { ok: true, message: `Case moved to “${STATUS_LABELS[result.toStatus]}”.` };
}

export async function assignCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const caseId = formData.get("caseId");
  const expected = formData.get("expectedAssigneeId");
  const intent = formData.get("intent");
  const selected = formData.get("assigneeId");
  if (typeof caseId !== "string" || typeof expected !== "string") return { ok: false, message: "Invalid request." };

  const assigneeId =
    intent === "claim" ? user.id : intent === "unassign" ? null : typeof selected === "string" && selected ? selected : undefined;
  if (assigneeId === undefined) return { ok: false, message: "Choose a person to assign." };

  const result = await assignCase(prisma, {
    caseId,
    actor: { id: user.id, role: user.role },
    assigneeId,
    expectedAssigneeId: expected || null,
  });
  if (!result.ok) return { ok: false, message: result.message };
  refresh(caseId);
  return { ok: true, message: assigneeId ? "Assignment updated." : "Case unassigned." };
}

export async function uploadDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const caseId = formData.get("caseId");
  const category = formData.get("category");
  const file = formData.get("file");
  if (typeof caseId !== "string" || !isDocumentCategory(category)) return { ok: false, message: "Choose a document type." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, message: "Files must be 10 MB or smaller." };

  const result = await uploadDocument(prisma, getStorage(), {
    caseId,
    actor: { id: user.id, role: user.role },
    category,
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return { ok: false, message: result.message };
  refresh(caseId);
  return { ok: true, message: "Document uploaded." };
}
