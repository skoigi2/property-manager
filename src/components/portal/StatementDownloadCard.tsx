"use client";
import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";

/**
 * Tenant-facing statement download for the portal Balance tab.
 *
 * NOT MOUNTED in Phase 1 — deliberately. The backing routes
 * (/api/portal/[token]/statement and .../statement/pdf) are live, but tenant
 * self-service waits until the Phase 0 unattributed-payment residue is
 * resolved, so legacy-property tenants never see a refused/blank statement.
 * To go live, render this inside the Balance tab of
 * src/app/(portal)/portal/[token]/page.tsx. Do NOT make mounting conditional
 * on the reconciliation count — conditional silent absence makes a working
 * feature look broken (same reasoning as the calendar empty-state sources).
 */
export function StatementDownloadCard({ token }: { token: string }) {
  const [mode, setMode] = useState<"lease-year" | "tenancy">("lease-year");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/statement/pdf?mode=${mode}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          typeof data?.error === "string" ? data.error : "The statement could not be generated.",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Statement of Account.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-gray-500" />
        <h3 className="text-body font-semibold text-gray-900">Statement of Account</h3>
      </div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode("lease-year")}
          className={`px-3 py-1.5 rounded-lg border text-caption ${
            mode === "lease-year" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
          }`}
        >
          Current lease year
        </button>
        <button
          onClick={() => setMode("tenancy")}
          className={`px-3 py-1.5 rounded-lg border text-caption ${
            mode === "tenancy" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"
          }`}
        >
          Full tenancy
        </button>
      </div>
      <button
        onClick={download}
        disabled={downloading}
        className="flex items-center gap-1.5 text-caption bg-gray-900 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Download PDF
      </button>
      {error && <p className="text-caption text-red-600 mt-2">{error}</p>}
    </div>
  );
}
