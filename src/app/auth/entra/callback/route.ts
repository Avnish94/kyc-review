import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { setSessionCookie } from "@/lib/auth/cookies";
import { exchangeCodeForClaims, getOidcConfig, identityFromClaims } from "@/lib/auth/oidc";
import { OIDC_STATE_COOKIE, sessionSecretKey } from "@/lib/auth/session";
import { upsertSsoUser } from "@/lib/auth/sso";
import { prisma } from "@/lib/db";

function fail(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.cookies.delete({ name: OIDC_STATE_COOKIE, path: "/auth/entra" });
  return response;
}

export async function GET(request: NextRequest) {
  const cfg = getOidcConfig();
  if (!cfg) return fail(request, "sso_disabled");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get(OIDC_STATE_COOKIE)?.value;
  if (!code || !state || !cookie) return fail(request, "sso_failed");

  try {
    const { payload: stored } = await jwtVerify(cookie, sessionSecretKey(), { algorithms: ["HS256"] });
    if (stored.state !== state || typeof stored.nonce !== "string" || typeof stored.verifier !== "string") {
      return fail(request, "sso_failed");
    }

    const claims = await exchangeCodeForClaims(cfg, { code, verifier: stored.verifier, nonce: stored.nonce });
    const identity = identityFromClaims(claims, cfg);
    if (!identity) return fail(request, "sso_failed");

    const result = await upsertSsoUser(prisma, identity);
    if (!result.ok) return fail(request, result.error);

    const response = NextResponse.redirect(new URL("/cases", request.url));
    response.cookies.delete({ name: OIDC_STATE_COOKIE, path: "/auth/entra" });
    await setSessionCookie(response.cookies, { userId: result.user.id, role: result.user.role });
    return response;
  } catch (err) {
    console.error("SSO callback failed", err);
    return fail(request, "sso_failed");
  }
}
