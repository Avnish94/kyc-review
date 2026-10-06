import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz";
import { uploadDocument } from "@/lib/documents/service";
import { LocalDiskStorage, type DocumentStorage } from "@/lib/documents/storage";
import { MAX_DOCUMENT_BYTES, sanitizeFileName, validateDocument } from "@/lib/documents/validation";
import { syntheticPdf } from "../scripts/synthetic-pdf";
import { createCase, createUser, db, resetDb } from "./helpers/db";

const pdf = syntheticPdf(["Test document"]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("validateDocument", () => {
  it("accepts files whose contents match their extension", () => {
    expect(validateDocument("passport.pdf", pdf)).toEqual({ ok: true, file: { fileName: "passport.pdf", contentType: "application/pdf" } });
    expect(validateDocument("scan.PNG", png)).toMatchObject({ ok: true, file: { contentType: "image/png" } });
  });

  it("rejects disguised, unsupported, empty and oversized files", () => {
    expect(validateDocument("passport.pdf", png).ok).toBe(false);
    expect(validateDocument("evil.html", new TextEncoder().encode("<script>")).ok).toBe(false);
    expect(validateDocument("empty.pdf", new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    big.set(pdf.subarray(0, 4));
    expect(validateDocument("big.pdf", big).ok).toBe(false);
  });

  it("sanitizes file names", () => {
    expect(sanitizeFileName("../../etc/pass\"wd<>.pdf")).toBe("pass_wd_.pdf");
    expect(sanitizeFileName("C:\\Users\\me\\ID card.pdf")).toBe("ID card.pdf");
  });
});

describe("LocalDiskStorage", () => {
  it("refuses keys that escape the storage root", async () => {
    const storage = new LocalDiskStorage(os.tmpdir());
    await expect(storage.get("../etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});

describe("uploadDocument", () => {
  let dir: string;
  let storage: DocumentStorage;
  let analyst: Actor;

  beforeEach(async () => {
    await resetDb();
    dir = await mkdtemp(path.join(os.tmpdir(), "kyc-docs-"));
    storage = new LocalDiskStorage(dir);
    analyst = await createUser("ANALYST");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await db.$disconnect();
  });

  it("stores the file, its metadata and an audit event", async () => {
    const c = await createCase({ assigneeId: analyst.id });
    const result = await uploadDocument(db, storage, { caseId: c.id, actor: analyst, category: "IDENTITY", fileName: "id.pdf", bytes: pdf });
    expect(result.ok).toBe(true);

    const doc = await db.caseDocument.findFirstOrThrow({ where: { caseId: c.id } });
    expect(doc).toMatchObject({ category: "IDENTITY", contentType: "application/pdf", sizeBytes: pdf.length });
    expect(new Uint8Array(await storage.get(doc.storageKey))).toEqual(pdf);
    expect(await db.auditEvent.findFirst({ where: { caseId: c.id } })).toMatchObject({
      action: "DOCUMENT_UPLOADED", actorId: analyst.id, toStatus: "PENDING_REVIEW",
    });
  });

  it("only lets the assignee or an Admin upload to open cases", async () => {
    const other = await createUser("ANALYST");
    const c = await createCase({ assigneeId: other.id });
    expect(await uploadDocument(db, storage, { caseId: c.id, actor: analyst, category: "IDENTITY", fileName: "id.pdf", bytes: pdf })).toMatchObject({
      ok: false,
    });
    const closed = await createCase({ status: "APPROVED", assigneeId: analyst.id });
    expect((await uploadDocument(db, storage, { caseId: closed.id, actor: analyst, category: "IDENTITY", fileName: "id.pdf", bytes: pdf })).ok).toBe(false);
    expect(await db.caseDocument.count()).toBe(0);
  });
});
