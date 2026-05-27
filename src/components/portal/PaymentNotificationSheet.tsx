"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import BottomSheet from "./BottomSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  invoiceId: string;
  invoiceNumber: string;
  onSubmitted: () => void;
};

export default function PaymentNotificationSheet({
  open,
  onClose,
  token,
  invoiceId,
  invoiceNumber,
  onSubmitted,
}: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setText("");
    setFile(null);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!text.trim() && !file) {
      toast.error("Please add a reference, a file, or both");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (text.trim()) fd.append("text", text.trim());
      if (file) fd.append("file", file);
      const res = await fetch(`/api/portal/${token}/invoices/${invoiceId}/proof`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Submission failed");
        setSubmitting(false);
        return;
      }
      toast.success("Proof submitted — your manager will verify shortly");
      reset();
      onSubmitted();
      onClose();
    } catch {
      toast.error("Submission failed");
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Notify Manager of Payment">
      <p className="text-sm text-gray-500 mb-4">
        Invoice <span className="font-medium text-gray-700">{invoiceNumber}</span>. Add a reference,
        a screenshot, or both — whatever you have to hand.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Upload screenshot or PDF
          </label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          {file && (
            <p className="text-xs text-gray-500 mt-1.5">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <div className="text-center text-xs text-gray-400 uppercase tracking-wide">and / or</div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Paste your transaction reference / SMS
          </label>
          <textarea
            rows={5}
            maxLength={2000}
            placeholder="Paste M-Pesa SMS or bank transfer reference here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">{text.length} / 2000 characters</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || (!text.trim() && !file)}
          className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-50 hover:bg-gray-800 transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Proof"}
        </button>

        <p className="text-xs text-gray-400 text-center pb-2">
          Your manager is notified immediately. They'll verify and mark the invoice as paid.
        </p>
      </div>
    </BottomSheet>
  );
}
