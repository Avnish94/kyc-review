import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTeamsPayload, dispatchOutbox, enqueueTeamsMessage } from "@/lib/notifications";
import { csvCell, toCsv } from "@/lib/reporting";
import { db, resetDb } from "./helpers/db";

describe("dispatchOutbox", () => {
  beforeEach(async () => {
    await resetDb();
    await enqueueTeamsMessage(db, { title: "T", text: "Body", url: "http://localhost:3000/cases/1" });
  });
  afterAll(() => db.$disconnect());

  it("skips messages when Teams is not configured", async () => {
    expect(await dispatchOutbox(db, { webhookUrl: "" })).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect((await db.outboxMessage.findFirstOrThrow()).status).toBe("SKIPPED");
  });

  it("posts an Adaptive Card and marks the message sent", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await dispatchOutbox(db, { webhookUrl: "https://teams.example/hook", fetchImpl })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual(buildTeamsPayload({ title: "T", text: "Body", url: "http://localhost:3000/cases/1" }));
    expect((await db.outboxMessage.findFirstOrThrow()).status).toBe("SENT");
  });

  it("retries failures and gives up after five attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    for (let i = 0; i < 5; i++) await dispatchOutbox(db, { webhookUrl: "https://teams.example/hook", fetchImpl });
    const msg = await db.outboxMessage.findFirstOrThrow();
    expect(msg).toMatchObject({ status: "FAILED", attempts: 5, lastError: "Teams webhook responded 500" });
    expect(await dispatchOutbox(db, { webhookUrl: "https://teams.example/hook", fetchImpl })).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });
});

describe("CSV export", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, new Date("2026-01-01T00:00:00Z")]])).toBe("a,b\r\n1,2026-01-01T00:00:00.000Z\r\n");
  });
});
