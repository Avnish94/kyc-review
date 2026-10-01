import type { PrismaClient } from "@prisma/client";
import type { OidcIdentity } from "@/lib/auth/oidc";
import type { Role } from "@/lib/kyc/types";

export type SsoUserResult = { ok: true; user: { id: string; role: Role } } | { ok: false; error: "no_role" | "inactive" };

/**
 * Just-in-time provisioning for SSO users. Links by Entra object ID, falling back to email (to link
 * a pre-created account), and syncs name and role from Entra on every sign-in.
 */
export async function upsertSsoUser(db: PrismaClient, identity: OidcIdentity): Promise<SsoUserResult> {
  if (!identity.role) return { ok: false, error: "no_role" };
  const role = identity.role;

  const existing =
    (await db.user.findUnique({ where: { entraObjectId: identity.subject } })) ??
    (await db.user.findUnique({ where: { email: identity.email } }));

  if (existing && !existing.active) return { ok: false, error: "inactive" };

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: { entraObjectId: identity.subject, name: identity.name, role, lastLoginAt: new Date() },
      })
    : await db.user.create({
        data: { email: identity.email, name: identity.name, role, entraObjectId: identity.subject, lastLoginAt: new Date() },
      });
  return { ok: true, user: { id: user.id, role } };
}
