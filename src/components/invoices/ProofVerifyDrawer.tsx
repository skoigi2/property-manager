"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  onVerified: () => void;
};

type ProofData = {
  invoiceNumber: string;
  totalAmount: number;
  periodYear: number;
  periodMonth: number;
  proofOfPaymentText: string | null;
  proofOfPaymentType: "FILE" | "TEXT" | "BOTH" | null;
  proofSubmittedAt: string | null;
  proofFileUrl: string | null;
  proofFileName: string | null;
  tenantName: string;
};

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

export default function ProofVerifyDrawer({ open, onClose, invoiceId, onVerified }: Props) {
  const [data, setData] = useState<ProofData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/invoices/${invoiceId}/verify-proof`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProofData | null) => {
        setData(d);
        if (d) setPaidAmount(d.totalAmount.toString());
      })
      .finally(() => setLoading(false));
  }, [open, invoiceId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit(action: "approve" | "reject") {
    setSubmitting(true);
    try {
      const body = action === "approve"
        ? { action, paidAmount: parseFloat(paidAmount) || 0, paidAt: new Date().toISOString(), paymentMethod }
        : { action };
      const res = await fetch(`/api/invoices/${invoiceId}/verify-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Action failed");
        setSubmitting(false);
        return;
      }
      toast.success(action === "approve" ? "Marked as paid" : "Proof rejected");
      onVerified();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function copyText() {
    if (!data?.proofOfPaymentText) return;
    navigator.clipboard.writeText(data.proofOfPaymentText);
    toast.success("Copied");
  }

  const isImage = data?.proofFileName && /\.(png|jpe?g|webp)$/i.test(data.proofFileName);
  const isPdf = data?.proofFileName?.toLowerCase().endsWith(".pdf");

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[520px] bg-white z-50 shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Verify Payment Proof</h3>
            {data && (
              <p className="text-xs text-gray-500">
                {data.tenantName} · Invoice {data.invoiceNumber}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading proof...</p>
          ) : !data ? (
            <p className="text-sm text-gray-400 text-center py-8">No proof found.</p>
          ) : (
            <>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Invoice Total</span>
                  <span className="font-semibold text-gray-900">{data.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-gray-700">
                    {data.proofSubmittedAt ? format(new Date(data.proofSubmittedAt), "d MMM yyyy, HH:mm") : "—"}
                  </span>
                </div>
              </div>

              {data.proofOfPaymentText && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Reference / SMS
                    </label>
                    <button onClick={copyText} className="text-xs text-blue-600 hover:underline">Copy</button>
                  </div>
                  <pre
                    className="bg-gray-100 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap text-gray-900 max-h-48 overflow-y-auto select-all"
                  >
                    {data.proofOfPaymentText}
                  </pre>
                </div>
              )}

              {data.proofFileUrl && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
                    Attached File
                  </label>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.proofFileUrl}
                      alt="Proof of payment"
                      className="w-full rounded-lg border border-gray-200"
                    />
                  ) : isPdf ? (
                    <iframe
                      src={data.proofFileUrl}
                      className="w-full h-96 rounded-lg border border-gray-200"
                      title="Proof of payment"
                    />
                  ) : (
                    <a
                      href={data.proofFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm text-blue-600 hover:underline"
                    >
                      Download {data.proofFileName ?? "file"}
                    </a>
                  )}
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Paid Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {data && (
          <div className="border-t border-gray-100 p-4 flex gap-2 shrink-0">
            <button
              onClick={() => submit("reject")}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Reject Proof
            </button>
            <button
              onClick={() => submit("approve")}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? "..." : "Mark as Paid"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
