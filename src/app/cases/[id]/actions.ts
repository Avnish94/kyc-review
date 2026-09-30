"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { performCaseAction } from "@/lib/kyc/service";
import { STATUS_LABELS, isCaseAction, isCaseStatus } from "@/lib/kyc/types";

export type ActionFormState = { ok?: boolean; message?: string };

export async function submitCaseAction(_prev: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const user = await requireUser();

  const caseId = formData.get("caseId");
  const action = formData.get("action");
  const expectedStatus = formData.get("expectedStatus");
  const note = formData.get("note");

  if (typeof caseId !== "string" || !isCaseAction(action) || !isCaseStatus(expectedStatus)) {
    return { ok: false, message: "Invalid request." };
  }

  const result = await performCaseAction(prisma, {
    caseId,
    action,
    expectedStatus,
    note: typeof note === "string" ? note : null,
    actor: { id: user.id, role: user.role },
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { ok: true, message: `Case moved to “${STATUS_LABELS[result.toStatus]}”.` };
}
