"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { PackageOpen, Loader2, X, CheckCircle, AlertTriangle, Building2 } from "lucide-react";

export interface ImportSummary {
  propertyId: string;
  propertyName: string;
  summary: {
    units: number;
    tenants: number;
    incomeEntries: number;
    expenseEntries: number;
    pettyCash: number;
    ownerInvoices: number;
    documents: number;
  };
  errors: { sheet: string; row: number; reason: string }[];
}

interface Props {
  onClose: () => void;
  /** Called after a successful import — used to refresh a property list, etc. */
  onImported?: () => void;
}

/**
 * Single-file ZIP uploader for restoring a property from a handover export.
 * Was previously on /properties but is now mounted from the /import "Handover"
 * tab — the import surface is the right home for it.
 */
export function ImportHandoverModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!file) {
      toast.error("Select a ZIP file");
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/handover", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? "Import failed");
        return;
      }
      setResult(data);
      onImported?.();
    } catch {
      setApiError("Network error — import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <PackageOpen size={18} className="text-gold shrink-0" />
            <div>
              <h3 className="font-display text-header text-lg">Import from Handover Package</h3>
              <p className="text-xs text-gray-400 font-sans mt-0.5">Restores a property from a .zip handover export</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <>
            {/* File picker */}
            <div>
              <label className="text-xs text-gray-500 font-sans uppercase tracking-wide font-medium block mb-2">
                Handover ZIP file
              </label>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${file ? "border-gold/40 bg-gold/5" : "border-gray-200 hover:border-gold/40"}`}>
                <PackageOpen size={28} className={file ? "text-gold" : "text-gray-300"} />
                <span className="text-sm font-sans text-gray-500">
                  {file ? file.name : "Click to select a .zip handover package"}
                </span>
                {file && <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setApiError(null); }}
                />
              </label>
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2 text-xs text-expense font-sans">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {apiError}
              </div>
            )}

            <p className="text-xs text-gray-400 font-sans">
              Will import: property, units, tenants, income, expenses, petty cash, owner invoices, and tenant documents.
              Management agreement settings must be configured manually after import.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSubmit}
                disabled={loading || !file}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><PackageOpen size={14} /> Import Property</>}
              </button>
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* Success summary */
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-income" />
                <p className="text-sm font-sans font-semibold text-income">{result.propertyName} imported successfully</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-sans text-gray-600">
                {[
                  ["Units",           result.summary.units],
                  ["Tenants",         result.summary.tenants],
                  ["Income entries",  result.summary.incomeEntries],
                  ["Expense entries", result.summary.expenseEntries],
                  ["Petty cash",      result.summary.pettyCash],
                  ["Owner invoices",  result.summary.ownerInvoices],
                  ["Documents",       result.summary.documents],
                ].map(([label, count]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span>{label}</span>
                    <span className="font-mono font-semibold text-header">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-h-36 overflow-y-auto">
                <p className="text-xs font-sans font-semibold text-amber-800 mb-1">{result.errors.length} row(s) skipped:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-700 font-sans">
                    {e.sheet} row {e.row}: {e.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href="/properties"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark"
              >
                <Building2 size={14} /> View Properties
              </Link>
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
