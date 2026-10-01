"use server";

import { revalidatePath } from "next/cache";
import { canManageRules } from "@/lib/authz";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseRulesForm } from "@/lib/rules/form";
import { publishRuleSet } from "@/lib/rules/store";

export type RulesFormState = { ok?: boolean; message?: string; errors?: string[] };

export async function publishRulesAction(_prev: RulesFormState, fd: FormData): Promise<RulesFormState> {
  const user = await requireUser();
  if (!canManageRules(user.role)) return { ok: false, message: "Only Admins can change rules." };

  const comment = String(fd.get("comment") ?? "").trim();
  if (!comment) return { ok: false, message: "Describe the change so reviewers know why the policy changed." };
  if (comment.length > 500) return { ok: false, message: "Keep the change description under 500 characters." };

  const parsed = parseRulesForm(fd);
  if (!parsed.ok) return { ok: false, message: "Fix the highlighted problems.", errors: parsed.errors };

  const version = await prisma.$transaction(
    (tx) => publishRuleSet(tx, { config: parsed.config, comment, createdById: user.id }),
    { isolationLevel: "Serializable" },
  );
  revalidatePath("/", "layout");
  return { ok: true, message: `Published rule set v${version}. It applies to all decisions from now on.` };
}
