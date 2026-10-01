import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl, createPkce, getOidcConfig } from "@/lib/auth/oidc";
import { OIDC_STATE_COOKIE, sessionSecretKey } from "@/lib/auth/session";

export async function GET(request: Request) {
  const cfg = getOidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?error=sso_disabled", request.url));

  const pkce = createPkce();
  let authorizationUrl: string;
  try {
    authorizationUrl = await buildAuthorizationUrl(cfg, pkce);
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }

  const state = await new SignJWT({ state: pkce.state, nonce: pkce.nonce, verifier: pkce.verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(sessionSecretKey());

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(OIDC_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/entra",
    maxAge: 600,
  });
  return response;
}
