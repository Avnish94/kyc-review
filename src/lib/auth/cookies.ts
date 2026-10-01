import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, type SessionPayload } from "@/lib/auth/session";

type CookieWriter = {
  set(name: string, value: string, options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number }): unknown;
};

export async function setSessionCookie(cookies: CookieWriter, payload: SessionPayload): Promise<void> {
  cookies.set(SESSION_COOKIE, await signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
