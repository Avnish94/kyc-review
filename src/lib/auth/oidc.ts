import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/lib/kyc/types";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  adminRole: string;
  analystRole: string;
};

/** Microsoft Entra ID settings from the environment, or null when single sign-on is not configured. */
export function getOidcConfig(): OidcConfig | null {
  const tenant = process.env.AUTH_ENTRA_TENANT_ID;
  const clientId = process.env.AUTH_ENTRA_CLIENT_ID;
  const clientSecret = process.env.AUTH_ENTRA_CLIENT_SECRET;
  const issuer = process.env.AUTH_OIDC_ISSUER || (tenant ? `https://login.microsoftonline.com/${tenant}/v2.0` : "");
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId,
    clientSecret,
    redirectUri: new URL("/auth/entra/callback", process.env.APP_BASE_URL ?? "http://localhost:3000").toString(),
    adminRole: process.env.AUTH_ENTRA_ADMIN_ROLE || "KYC.Admin",
    analystRole: process.env.AUTH_ENTRA_ANALYST_ROLE || "KYC.Analyst",
  };
}

/** Mock password login is on by default only when SSO is not configured. */
export function isMockLoginEnabled(): boolean {
  const flag = process.env.AUTH_MOCK_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return getOidcConfig() === null;
}

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };

const discoveryCache = new Map<string, Promise<Discovery>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function discover(issuer: string): Promise<Discovery> {
  let pending = discoveryCache.get(issuer);
  if (!pending) {
    pending = fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) }).then(
      async (res) => {
        if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
        return (await res.json()) as Discovery;
      },
    );
    pending.catch(() => discoveryCache.delete(issuer));
    discoveryCache.set(issuer, pending);
  }
  return pending;
}

const base64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: base64url(randomBytes(16)), nonce: base64url(randomBytes(16)) };
}

export async function buildAuthorizationUrl(cfg: OidcConfig, p: { state: string; nonce: string; challenge: string }) {
  const d = await discover(cfg.issuer);
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Exchanges the authorization code and returns verified ID token claims. */
export async function exchangeCodeForClaims(
  cfg: OidcConfig,
  input: { code: string; verifier: string; nonce: string },
): Promise<JWTPayload> {
  const d = await discover(cfg.issuer);
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: input.code,
      redirect_uri: cfg.redirectUri,
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new Error("Token response did not include an id_token");

  let jwks = jwksCache.get(d.jwks_uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(d.jwks_uri));
    jwksCache.set(d.jwks_uri, jwks);
  }
  const { payload } = await jwtVerify(idToken, jwks, { issuer: d.issuer, audience: cfg.clientId });
  if (payload.nonce !== input.nonce) throw new Error("ID token nonce mismatch");
  return payload;
}

export type OidcIdentity = { subject: string; email: string; name: string; role: Role | null };

/**
 * Maps Entra ID token claims to an app identity. Roles come from Entra *app roles* (the `roles`
 * claim) so access is managed in Entra; Admin wins if a user holds both roles.
 */
export function identityFromClaims(claims: JWTPayload, cfg: Pick<OidcConfig, "adminRole" | "analystRole">): OidcIdentity | null {
  const subject = typeof claims.oid === "string" ? claims.oid : claims.sub;
  const emailClaim = [claims.email, claims.preferred_username].find((v): v is string => typeof v === "string" && v.includes("@"));
  if (!subject || !emailClaim) return null;
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === "string") : [];
  const role: Role | null = roles.includes(cfg.adminRole) ? "ADMIN" : roles.includes(cfg.analystRole) ? "ANALYST" : null;
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : emailClaim;
  return { subject, email: emailClaim.toLowerCase(), name, role };
}
