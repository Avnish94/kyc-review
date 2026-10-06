import { beforeAll, describe, expect, it } from "vitest";
import { signDownloadToken, verifyDownloadToken } from "@/lib/auth/download-token";
import { signSession } from "@/lib/auth/session";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123";
});

describe("download tokens", () => {
  it("round-trips the user for the export it was issued for", async () => {
    const token = await signDownloadToken("user-1", "cases");
    expect(await verifyDownloadToken(token, "cases")).toBe("user-1");
  });

  it("rejects a token issued for a different export", async () => {
    const token = await signDownloadToken("user-1", "cases");
    expect(await verifyDownloadToken(token, "audit")).toBeNull();
  });

  it("rejects session tokens and tampered tokens", async () => {
    const session = await signSession({ userId: "user-1", role: "ADMIN" });
    expect(await verifyDownloadToken(session, "cases")).toBeNull();
    const token = await signDownloadToken("user-1", "audit");
    expect(await verifyDownloadToken(`${token.slice(0, -2)}xx`, "audit")).toBeNull();
  });
});
