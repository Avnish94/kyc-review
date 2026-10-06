export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SIGNATURES: { contentType: string; extensions: string[]; magic: number[] }[] = [
  { contentType: "application/pdf", extensions: ["pdf"], magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { contentType: "image/png", extensions: ["png"], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: "image/jpeg", extensions: ["jpg", "jpeg"], magic: [0xff, 0xd8, 0xff] },
];

export const ACCEPTED_EXTENSIONS = SIGNATURES.flatMap((s) => s.extensions.map((e) => `.${e}`));

export type ValidatedFile = { fileName: string; contentType: string };

export type FileValidationResult = { ok: true; file: ValidatedFile } | { ok: false; message: string };

/** Keeps a readable, header-safe file name: strips paths and control/special characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "document";
}

/**
 * Validates an uploaded file by size and by its actual leading bytes (not the browser-supplied
 * MIME type), and checks the extension agrees with the detected type.
 */
export function validateDocument(fileName: string, bytes: Uint8Array): FileValidationResult {
  if (bytes.length === 0) return { ok: false, message: "The file is empty." };
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, message: "Files must be 10 MB or smaller." };

  const detected = SIGNATURES.find((s) => s.magic.every((b, i) => bytes[i] === b));
  if (!detected) return { ok: false, message: "Only PDF, PNG and JPEG files are accepted." };

  const safeName = sanitizeFileName(fileName);
  const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
  if (!detected.extensions.includes(ext)) {
    return { ok: false, message: `The file extension does not match its contents (${detected.contentType}).` };
  }
  return { ok: true, file: { fileName: safeName, contentType: detected.contentType } };
}
