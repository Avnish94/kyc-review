"use client";

import { useState } from "react";
import type { ExportKind } from "@/lib/auth/download-token";
import { createExportLinkAction } from "./actions";

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: "cases", label: "Export cases (CSV)" },
  { kind: "audit", label: "Export audit log (CSV)" },
];

export function ExportButtons() {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: ExportKind) {
    setBusy(kind);
    setError(null);
    // Open the tab synchronously so popup blockers treat it as a user action.
    const tab = window.open("", "_blank");
    try {
      const res = await createExportLinkAction(kind);
      if (!res.url) throw new Error(res.error ?? "Could not create the download link.");
      if (tab) {
        tab.opener = null;
        tab.location.href = res.url;
      } else {
        window.location.href = res.url;
      }
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Could not create the download link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="text-sm">
      <div className="flex gap-2">
        {EXPORTS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => download(kind)}
            disabled={busy !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === kind ? "Preparing…" : label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
