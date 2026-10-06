"use server";

import { canExportData } from "@/lib/authz";
import { requireUser } from "@/lib/auth/current-user";
import { EXPORT_KINDS, signDownloadToken, type ExportKind } from "@/lib/auth/download-token";

export async function createExportLinkAction(kind: ExportKind): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  if (!canExportData(user.role)) return { error: "Only Admins can export data." };
  if (!EXPORT_KINDS.includes(kind)) return { error: "Unknown export." };
  const token = await signDownloadToken(user.id, kind);
  return { url: `/api/export/${kind}?token=${encodeURIComponent(token)}` };
}
