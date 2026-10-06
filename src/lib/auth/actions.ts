"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/cookies";
import { isMockLoginEnabled } from "@/lib/auth/oidc";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isRole } from "@/lib/kyc/types";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isMockLoginEnabled()) return { error: "Password sign-in is disabled. Use Microsoft sign-in." };

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: INVALID_CREDENTIALS, email };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = user?.passwordHash ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !passwordOk || !user.active || !isRole(user.role)) return { error: INVALID_CREDENTIALS, email };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setSessionCookie(await cookies(), { userId: user.id, role: user.role });
  redirect("/cases");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
