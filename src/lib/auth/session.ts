import { jwtVerify, SignJWT } from "jose";
import { isRole, type Role } from "@/lib/kyc/types";

export const SESSION_COOKIE = "kyc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const OIDC_STATE_COOKIE = "kyc_oidc";

export type SessionPayload = { userId: string; role: Role };

export function sessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a string of at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || !isRole(payload.role)) return null;
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
