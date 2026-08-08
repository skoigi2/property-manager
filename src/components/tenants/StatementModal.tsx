"use client";
import { useCallback, useEffect, useState } from "react";
import { X, Download, Mail, Loader2, AlertTriangle, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import toast from "react-hot-toast";

type Mode = "lease-year" | "tenancy" | "calendar-year" | "custom";

interface StatementPreview {
  noPeriod?: boolean;
  reason?: string;
  period?: { label: string };
  currency?: string;
  summary?: {
    closingBalance: number;
    totalPaid: number;
    position: "ARREARS" | "CREDIT" | "SETTLED" | "NOT_STATED";
    awaitingConfirmation: { count: number; total: number };
  };
  coverage?: {
    monthsInPeriod: number;
    invoiceCount: number;
    paymentCount: number;
    unattributedForProperty: { count: number; total: number };
    isEmpty: boolean;
    emptyReason: string | null;
  };
  warnings?: string[];
}

interface Props {
  tenantId: string;
  tenantName: string;
  tenantEmail: string | null;
  onClose: () => void;
}

const MODES: { value: Mode; label: string }[] = [
  { value: "lease-year", label: "Current lease year" },
  { value: "tenancy", label: "Full tenancy" },
  { value: "calendar-year", label: "Calendar year" },
  { value: "custom", label: "Custom period" },
];

export function StatementModal({ tenantId, tenantName, tenantEmail, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("lease-year");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [confirmUnattributed, setConfirmUnattributed] = useState(false);

  const query = useCallback(() => {
    const p = new URLSearchParams({ mode });
    if (mode === "calendar-year") p.set("year", String(year));
    if (mode === "custom") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    return p.toString();
  }, [mode, year, from, to]);

  useEffect(() => {
    if (mode === "custom" && (!from || !to)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreviewError(null);
    setConfirmUnattributed(false);
    fetch(`/api/tenants/${tenantId}/statement?${query()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok) {
          setPreview(null);
          setPreviewError(typeof data?.error === "string" ? data.error : "Failed to load statement");
        } else {
          setPreview(data);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Failed to load statement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId, mode, year, from, to, query]);

  const coverage = preview?.coverage;
  const isEmpty = coverage?.isEmpty ?? false;
  const unattributed = coverage?.unattributedForProperty;
  const currency = preview?.currency ?? "USD";
  const canProduce = !!preview && !preview.noPeriod && !isEmpty && !loading;

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/statement/pdf?${query()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to generate PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statement - ${tenantName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function emailStatement() {
    if ((unattributed?.count ?? 0) > 0 && !confirmUnattributed) {
      setConfirmUnattributed(true);
      return;
    }
    setEmailing(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/statement/send?${query()}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to send");
      toast.success(`Statement emailed to ${data.sentTo}`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEmailing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-gold-dark" />
            <h3 className="text-h3 text-gray-900">Statement of Account</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Period picker */}
          <div>
            <label className="text-label uppercase text-gray-400 block mb-2">Period</label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`px-3 py-2 rounded-lg border text-body text-left transition-colors ${
                    mode === m.value
                      ? "border-gold bg-gold/10 text-gold-dark font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "calendar-year" && (
            <div>
              <label className="text-label uppercase text-gray-400 block mb-1">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-body"
              />
            </div>
          )}
          {mode === "custom" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-label uppercase text-gray-400 block mb-1">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body" />
              </div>
              <div className="flex-1">
                <label className="text-label uppercase text-gray-400 block mb-1">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body" />
              </div>
            </div>
          )}

          {/* Preview / coverage */}
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-body py-3">
              <Loader2 size={14} className="animate-spin" /> Checking records…
            </div>
          ) : previewError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-body text-red-700">{previewError}</div>
          ) : preview?.noPeriod ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-body text-gray-600">{preview.reason}</div>
          ) : preview && coverage ? (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-body font-medium text-gray-900">{preview.period?.label}</p>
                <p className="text-caption text-gray-500 mt-1">
                  {coverage.invoiceCount} invoice{coverage.invoiceCount === 1 ? "" : "s"} ·{" "}
                  {coverage.paymentCount} payment{coverage.paymentCount === 1 ? "" : "s"} ·{" "}
                  {coverage.monthsInPeriod} month{coverage.monthsInPeriod === 1 ? "" : "s"}
                </p>
                {preview.summary && !isEmpty && (
                  <p className="text-body mt-2">
                    {preview.summary.position === "ARREARS" ? (
                      <span className="text-expense font-medium">
                        In arrears: {formatCurrency(Math.abs(preview.summary.closingBalance), currency)}
                      </span>
                    ) : preview.summary.position === "CREDIT" ? (
                      <span className="text-income font-medium">
                        In credit: {formatCurrency(Math.abs(preview.summary.closingBalance), currency)}
                      </span>
                    ) : preview.summary.position === "NOT_STATED" ? (
                      <span className="text-gray-600 font-medium">
                        Payments-only — {formatCurrency(preview.summary.totalPaid, currency)} recorded;
                        no invoices issued, balance not stated
                      </span>
                    ) : (
                      <span className="text-income font-medium">Settled — nothing owing</span>
                    )}
                  </p>
                )}
                {preview.summary && preview.summary.awaitingConfirmation.count > 0 && (
                  <p className="text-caption text-amber-700 mt-1">
                    {preview.summary.awaitingConfirmation.count} payment(s) totalling{" "}
                    {formatCurrency(preview.summary.awaitingConfirmation.total, currency)} awaiting confirmation
                  </p>
                )}
              </div>

              {isEmpty && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-body font-medium text-red-800">No records found — statement blocked</p>
                      <p className="text-caption text-red-700 mt-1">{coverage.emptyReason}</p>
                    </div>
                  </div>
                </div>
              )}

              {!isEmpty && (unattributed?.count ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-body font-medium text-amber-800">
                        {unattributed!.count} unattributed payment{unattributed!.count === 1 ? "" : "s"} on this property
                      </p>
                      <p className="text-caption text-amber-700 mt-1">
                        {formatCurrency(unattributed!.total, currency)} in this period is recorded without a tenant.
                        If any of it belongs to {tenantName}, the statement will understate what they&apos;ve paid.
                        Run <code className="font-mono">npm run statements:backfill-links</code> or link the entries,
                        then regenerate.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(preview.warnings ?? []).map((w, i) => (
                <p key={i} className="text-caption text-amber-700">{w}</p>
              ))}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={downloadPdf}
              disabled={!canProduce || downloading}
              className="flex items-center gap-1.5 px-4 py-2 bg-header text-white text-body rounded-lg hover:bg-header/90 transition-colors disabled:opacity-40"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download PDF
            </button>
            <button
              onClick={emailStatement}
              disabled={!canProduce || emailing || !tenantEmail}
              className={`flex items-center gap-1.5 px-4 py-2 border text-body rounded-lg transition-colors disabled:opacity-40 ${
                confirmUnattributed
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-gray-200 text-gray-600 hover:border-gold hover:text-gold-dark"
              }`}
            >
              {emailing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {confirmUnattributed ? "Send anyway?" : "Email to tenant"}
            </button>
          </div>
          {!tenantEmail && (
            <p className="text-caption text-red-600">
              This tenant has no email address on file — add one to enable emailing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
