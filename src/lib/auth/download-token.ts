import { jwtVerify, SignJWT } from "jose";
import { sessionSecretKey } from "@/lib/auth/session";

export const EXPORT_KINDS = ["cases", "audit"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const DOWNLOAD_TOKEN_TTL_SECONDS = 60;
const AUDIENCE = "kyc-export";

/** Short-lived token that lets a new browser tab download one export without the session cookie. */
export async function signDownloadToken(userId: string, kind: ExportKind): Promise<string> {
  return new SignJWT({ kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DOWNLOAD_TOKEN_TTL_SECONDS}s`)
    .sign(sessionSecretKey());
}

export async function verifyDownloadToken(token: string, kind: ExportKind): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), { algorithms: ["HS256"], audience: AUDIENCE });
    if (!payload.sub || payload.kind !== kind) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
