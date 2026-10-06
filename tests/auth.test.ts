import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identityFromClaims } from "@/lib/auth/oidc";
import { upsertSsoUser } from "@/lib/auth/sso";
import { db, resetDb } from "./helpers/db";

const cfg = { adminRole: "KYC.Admin", analystRole: "KYC.Analyst" };

describe("identityFromClaims", () => {
  it("maps Entra claims and app roles", () => {
    expect(
      identityFromClaims({ oid: "oid-1", sub: "sub-1", preferred_username: "Jo@Corp.example", name: "Jo", roles: ["KYC.Analyst"] }, cfg),
    ).toEqual({ subject: "oid-1", email: "jo@corp.example", name: "Jo", role: "ANALYST" });
  });

  it("gives Admin precedence and returns no role when none is assigned", () => {
    expect(identityFromClaims({ sub: "s", email: "a@x.example", roles: ["KYC.Analyst", "KYC.Admin"] }, cfg)?.role).toBe("ADMIN");
    expect(identityFromClaims({ sub: "s", email: "a@x.example", roles: ["Other"] }, cfg)?.role).toBeNull();
  });

  it("rejects tokens without a subject or email", () => {
    expect(identityFromClaims({ email: "a@x.example" }, cfg)).toBeNull();
    expect(identityFromClaims({ sub: "s", preferred_username: "not-an-email" }, cfg)).toBeNull();
  });
});

describe("upsertSsoUser", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("provisions a new user just in time and syncs role changes on later sign-ins", async () => {
    const first = await upsertSsoUser(db, { subject: "oid-1", email: "jo@corp.example", name: "Jo", role: "ANALYST" });
    expect(first.ok).toBe(true);
    const again = await upsertSsoUser(db, { subject: "oid-1", email: "jo@corp.example", name: "Jo Smith", role: "ADMIN" });
    expect(again).toMatchObject({ ok: true, user: { role: "ADMIN" } });
    expect(await db.user.findUniqueOrThrow({ where: { entraObjectId: "oid-1" } })).toMatchObject({ name: "Jo Smith", passwordHash: null });
  });

  it("links an existing account by email", async () => {
    const existing = await db.user.create({ data: { email: "jo@corp.example", name: "Jo", role: "ANALYST", passwordHash: "x" } });
    const result = await upsertSsoUser(db, { subject: "oid-9", email: "jo@corp.example", name: "Jo", role: "ANALYST" });
    expect(result).toMatchObject({ ok: true, user: { id: existing.id } });
  });

  it("refuses users without a role or who are deactivated", async () => {
    expect(await upsertSsoUser(db, { subject: "o", email: "n@corp.example", name: "N", role: null })).toEqual({ ok: false, error: "no_role" });
    await db.user.create({ data: { email: "gone@corp.example", name: "G", role: "ANALYST", active: false } });
    expect(await upsertSsoUser(db, { subject: "o2", email: "gone@corp.example", name: "G", role: "ANALYST" })).toEqual({
      ok: false,
      error: "inactive",
    });
    expect(await db.user.count()).toBe(1);
  });
});
