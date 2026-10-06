import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type TeamsMessage = { title: string; text: string; url?: string };

export function appUrl(path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}

/** In-app notifications. Call inside the same transaction as the change that triggered them. */
export async function notifyUsers(
  db: Db,
  input: { userIds: readonly string[]; caseId?: string; title: string; body: string },
): Promise<void> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, caseId: input.caseId, title: input.title, body: input.body })),
  });
}

export async function activeAdminIds(db: Db, excludeUserId?: string): Promise<string[]> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true, ...(excludeUserId && { id: { not: excludeUserId } }) },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Queues a Teams message in the transactional outbox; dispatchOutbox delivers it after commit. */
export async function enqueueTeamsMessage(db: Db, message: TeamsMessage): Promise<void> {
  await db.outboxMessage.create({ data: { channel: "TEAMS", payload: message } });
}

/**
 * Payload for a Teams "Workflows" incoming webhook ("When a Teams webhook request is received"
 * template), which accepts Adaptive Cards wrapped in a message envelope.
 */
export function buildTeamsPayload(message: TeamsMessage) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: message.title, weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: message.text, wrap: true },
          ],
          actions: message.url ? [{ type: "Action.OpenUrl", title: "Open case", url: message.url }] : [],
        },
      },
    ],
  };
}

const MAX_ATTEMPTS = 5;

function isTeamsMessage(v: unknown): v is TeamsMessage {
  return typeof v === "object" && v !== null && "title" in v && "text" in v;
}

/**
 * Delivers pending outbox messages. Without TEAMS_WEBHOOK_URL messages are marked SKIPPED so the
 * app works locally without Teams. Failures are retried up to MAX_ATTEMPTS times.
 */
export async function dispatchOutbox(
  db: PrismaClient,
  options: { webhookUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const webhookUrl = options.webhookUrl ?? process.env.TEAMS_WEBHOOK_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const pending = await db.outboxMessage.findMany({
    where: { status: "PENDING", channel: "TEAMS" },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  const result = { sent: 0, failed: 0, skipped: 0 };

  for (const msg of pending) {
    if (!webhookUrl || !isTeamsMessage(msg.payload)) {
      await db.outboxMessage.update({
        where: { id: msg.id },
        data: { status: "SKIPPED", lastError: webhookUrl ? "Invalid payload" : "TEAMS_WEBHOOK_URL not configured" },
      });
      result.skipped++;
      continue;
    }
    try {
      const res = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildTeamsPayload(msg.payload)),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Teams webhook responded ${res.status}`);
      await db.outboxMessage.update({
        where: { id: msg.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      result.sent++;
    } catch (err) {
      const attempts = msg.attempts + 1;
      await db.outboxMessage.update({
        where: { id: msg.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      result.failed++;
    }
  }
  return result;
}
