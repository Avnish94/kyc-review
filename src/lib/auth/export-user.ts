import "server-only";
import { NextResponse } from "next/server";
import { canExportData } from "@/lib/authz";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { verifyDownloadToken, type ExportKind } from "@/lib/auth/download-token";
import { prisma } from "@/lib/db";
import { isRole } from "@/lib/kyc/types";

async function userFromToken(token: string, kind: ExportKind): Promise<CurrentUser | null> {
  const userId = await verifyDownloadToken(token, kind);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || !isRole(user.role)) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Resolves the exporting user from a download token or the session, or returns the error response. */
export async function authorizeExport(request: Request, kind: ExportKind): Promise<CurrentUser | NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  const user = token ? await userFromToken(token, kind) : await getCurrentUser();
  if (!user) {
    const error = token ? "This download link has expired. Go back to the Dashboard and click Export again." : "Unauthorized";
    return NextResponse.json({ error }, { status: 401 });
  }
  if (!canExportData(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
