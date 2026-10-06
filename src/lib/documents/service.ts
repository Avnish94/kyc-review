import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/authz";
import { newStorageKey, sha256Hex, type DocumentStorage } from "@/lib/documents/storage";
import { validateDocument } from "@/lib/documents/validation";
import { getActiveRules } from "@/lib/rules/store";
import { DOCUMENT_CATEGORY_LABELS, isOpenStatus, type DocumentCategory } from "@/lib/kyc/types";

export type UploadResult = { ok: true; documentId: string } | { ok: false; message: string };

export function canUploadDocument(actor: Actor, kycCase: { status: string; assigneeId: string | null }) {
  if (!isOpenStatus(kycCase.status)) return { allowed: false as const, reason: "Documents can only be added to open cases." };
  if (actor.role !== "ADMIN" && kycCase.assigneeId !== actor.id) {
    return { allowed: false as const, reason: "Only the assignee or an Admin can add documents." };
  }
  return { allowed: true as const };
}

/**
 * Validates and stores a document, then records it with an audit event. The blob is written first;
 * if the database transaction fails the blob is deleted so storage never holds untracked files.
 */
export async function uploadDocument(
  db: PrismaClient,
  storage: DocumentStorage,
  input: { caseId: string; actor: Actor; category: DocumentCategory; fileName: string; bytes: Uint8Array },
): Promise<UploadResult> {
  const kycCase = await db.kycCase.findUnique({ where: { id: input.caseId }, select: { id: true, status: true, assigneeId: true } });
  if (!kycCase) return { ok: false, message: "Case not found." };
  const authz = canUploadDocument(input.actor, kycCase);
  if (!authz.allowed) return { ok: false, message: authz.reason };

  const validated = validateDocument(input.fileName, input.bytes);
  if (!validated.ok) return validated;

  const storageKey = newStorageKey(kycCase.id);
  await storage.put(storageKey, input.bytes, validated.file.contentType);

  try {
    const doc = await db.$transaction(async (tx) => {
      const current = await tx.kycCase.findUniqueOrThrow({ where: { id: kycCase.id }, select: { status: true } });
      const created = await tx.caseDocument.create({
        data: {
          caseId: kycCase.id,
          category: input.category,
          fileName: validated.file.fileName,
          contentType: validated.file.contentType,
          sizeBytes: input.bytes.length,
          sha256: sha256Hex(input.bytes),
          storageKey,
          uploadedById: input.actor.id,
        },
      });
      const rules = await getActiveRules(tx);
      await tx.auditEvent.create({
        data: {
          caseId: kycCase.id,
          actorId: input.actor.id,
          action: "DOCUMENT_UPLOADED",
          fromStatus: null,
          toStatus: current.status,
          note: `${DOCUMENT_CATEGORY_LABELS[input.category]}: ${validated.file.fileName}`,
          ruleSetVersion: rules.version,
          metadata: { documentId: created.id, sha256: created.sha256 },
        },
      });
      return created;
    });
    return { ok: true, documentId: doc.id };
  } catch (err) {
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
}
