/**
 * Minimal local OpenID Connect provider that imitates Microsoft Entra ID for development and E2E
 * tests (authorization code + PKCE, RS256 ID tokens with `oid` and `roles` claims).
 * Never use in production. Run: npm run mock:oidc
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const PORT = Number(process.env.MOCK_OIDC_PORT ?? 4010);
const ISSUER = process.env.MOCK_OIDC_ISSUER ?? `http://localhost:${PORT}`;
// Browser-facing base URL when the provider is reached through a proxy; back-channel endpoints stay on ISSUER.
const PUBLIC_URL = process.env.MOCK_OIDC_PUBLIC_URL ?? ISSUER;
const CLIENT_SECRET = process.env.MOCK_OIDC_CLIENT_SECRET ?? "mock-secret";

const IDENTITIES = [
  { id: "priya", oid: "00000000-0000-4000-8000-000000000001", name: "Priya Nair", email: "priya.nair@contoso.example", roles: ["KYC.Analyst"] },
  { id: "jordan", oid: "00000000-0000-4000-8000-000000000002", name: "Jordan Lee", email: "jordan.lee@contoso.example", roles: ["KYC.Admin"] },
  { id: "casey", oid: "00000000-0000-4000-8000-000000000003", name: "Casey Morgan (no KYC role)", email: "casey.morgan@contoso.example", roles: [] },
];

type PendingCode = { identity: (typeof IDENTITIES)[number]; clientId: string; redirectUri: string; nonce: string; challenge: string };
const codes = new Map<string, PendingCode>();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "mock-key", alg: "RS256", use: "sig" };

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", ISSUER);
    try {
      if (url.pathname === "/.well-known/openid-configuration") {
        return json(res, 200, {
          issuer: ISSUER,
          authorization_endpoint: `${PUBLIC_URL}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/jwks`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          id_token_signing_alg_values_supported: ["RS256"],
        });
      }
      if (url.pathname === "/jwks") return json(res, 200, { keys: [jwk] });

      if (url.pathname === "/authorize") {
        const p = url.searchParams;
        const user = IDENTITIES.find((i) => i.id === p.get("login_as"));
        if (!user) {
          const hidden = [...p.entries()].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
          const buttons = IDENTITIES.map(
            (i) => `<button name="login_as" value="${i.id}">${esc(i.name)}<small>${esc(i.email)} · ${esc(i.roles.join(", ") || "no roles")}</small></button>`,
          ).join("");
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html><title>Mock Entra ID</title>
<style>body{font-family:system-ui;background:#f3f2f1;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;padding:2rem;width:22rem;box-shadow:0 2px 6px #0002}h1{font-size:1.2rem}
button{display:block;width:100%;text-align:left;margin:.5rem 0;padding:.7rem;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:1rem}
button:hover{background:#f0f6ff}small{display:block;color:#666;font-size:.75rem}p{color:#a4262c;font-size:.8rem}</style>
<main><h1>Mock Microsoft sign-in</h1><p>Local development identity provider — not real Entra ID.</p>
<form method="get" action="authorize">${hidden}${buttons}</form></main>`);
          return;
        }
        const redirectUri = p.get("redirect_uri") ?? "";
        const code = randomBytes(16).toString("base64url");
        codes.set(code, {
          identity: user,
          clientId: p.get("client_id") ?? "",
          redirectUri,
          nonce: p.get("nonce") ?? "",
          challenge: p.get("code_challenge") ?? "",
        });
        const back = new URL(redirectUri);
        back.searchParams.set("code", code);
        back.searchParams.set("state", p.get("state") ?? "");
        res.writeHead(302, { location: back.toString() }).end();
        return;
      }

      if (url.pathname === "/token" && req.method === "POST") {
        const body = await readBody(req);
        const pending = codes.get(body.get("code") ?? "");
        codes.delete(body.get("code") ?? "");
        const verifier = body.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (
          !pending ||
          body.get("client_id") !== pending.clientId ||
          body.get("client_secret") !== CLIENT_SECRET ||
          body.get("redirect_uri") !== pending.redirectUri ||
          challenge !== pending.challenge
        ) {
          return json(res, 400, { error: "invalid_grant" });
        }
        const u = pending.identity;
        const idToken = await new SignJWT({
          oid: u.oid, name: u.name, preferred_username: u.email, email: u.email, roles: u.roles, nonce: pending.nonce,
        })
          .setProtectedHeader({ alg: "RS256", kid: "mock-key" })
          .setIssuer(ISSUER)
          .setAudience(pending.clientId)
          .setSubject(u.oid)
          .setIssuedAt()
          .setExpirationTime("10m")
          .sign(privateKey);
        return json(res, 200, { token_type: "Bearer", id_token: idToken, expires_in: 600 });
      }
      json(res, 404, { error: "not_found" });
    } catch (err) {
      console.error(err);
      json(res, 500, { error: "server_error" });
    }
  }).listen(PORT, () => console.log(`Mock OIDC provider listening on ${ISSUER}`));
}

void main();
