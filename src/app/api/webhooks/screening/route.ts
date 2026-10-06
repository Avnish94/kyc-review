import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestScreeningAlert, screeningAlertSchema } from "@/lib/integrations/screening";
import { SIGNATURE_HEADER, verifyWebhookSignature } from "@/lib/integrations/webhook-signature";
import { dispatchOutbox } from "@/lib/notifications";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const secret = process.env.SCREENING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyWebhookSignature(body, request.headers.get(SIGNATURE_HEADER), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = screeningAlertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 422 });
  }

  const provider = request.headers.get("x-kyc-provider")?.slice(0, 50) || "screening";
  const result = await ingestScreeningAlert(prisma, provider, parsed.data);
  if (result.status === "created") await dispatchOutbox(prisma).catch(() => undefined);
  return NextResponse.json(result, { status: result.status === "created" ? 201 : 200 });
}
