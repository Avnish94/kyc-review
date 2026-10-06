import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-kyc-signature";
const DEFAULT_TOLERANCE_SECONDS = 300;

export function signWebhookBody(body: string, secret: string, timestamp: number): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Verifies a `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` signature header.
 * The timestamp is part of the signed content and must be recent, which blocks replays.
 */
export function verifyWebhookSignature(
  body: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}
