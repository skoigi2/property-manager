"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/currency";

interface VendorView {
  expired: boolean;
  closed: boolean;
  vendorName: string;
  orgName: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  isEmergency: boolean;
  propertyName: string;
  propertyAddress: string | null;
  unitNumber: string | null;
  currency: string;
  existingQuote: { amount: number; note: string | null; at: string } | null;
  scheduledDate: string | null;
}

export default function VendorLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<VendorView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { updated: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vendor/${token}`)
      .then((r) => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then((d: VendorView | null) => {
        if (!d) return;
        setData(d);
        if (d.existingQuote) {
          setAmount(String(d.existingQuote.amount));
          setNote(d.existingQuote.note ?? "");
        }
      })
      .catch(() => setNotFound(true));
  }, [token]);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("Enter a valid quote amount"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, note: note || null, availableDate: availableDate || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not submit your quote"); return; }
      setDone({ updated: json.updated });
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <Centered>
        <h1 className="text-h1 mb-2">Link not found</h1>
        <p className="text-gray-500">This quote link is invalid or has been replaced.</p>
      </Centered>
    );
  }
  if (!data) return <Centered><p className="text-gray-500">Loading…</p></Centered>;

  if (done) {
    return (
      <Centered>
        <div className="text-income text-h1 mb-2">✓</div>
        <h1 className="text-h1 mb-2">{done.updated ? "Quote updated" : "Quote submitted"}</h1>
        <p className="text-gray-500">
          {data.orgName} has been notified. They&apos;ll come back to you on this quote — you can
          reopen this link to update it while it remains valid.
        </p>
      </Centered>
    );
  }

  if (data.closed) {
    return (
      <Centered>
        <h1 className="text-h1 mb-2">Job closed</h1>
        <p className="text-gray-500">This job has been completed or cancelled — no quote is needed.</p>
      </Centered>
    );
  }
  if (data.expired) {
    return (
      <Centered>
        <h1 className="text-h1 mb-2">Link expired</h1>
        <p className="text-gray-500">This quote link has expired. Please ask {data.orgName} for a new one.</p>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-label uppercase text-gray-400 mb-1">{data.orgName} — quote request</p>
          <h1 className="text-h2 text-header mb-1">{data.title}</h1>
          <p className="text-body text-gray-500 mb-1">
            {data.propertyName}
            {data.unitNumber ? ` · Unit ${data.unitNumber}` : ""}
            {data.propertyAddress ? ` · ${data.propertyAddress}` : ""}
          </p>
          <p className="text-caption text-gray-400 mb-4">
            {data.category.replace(/_/g, " ").toLowerCase()} · priority {data.priority.toLowerCase()}
            {data.isEmergency && <span className="text-expense font-medium"> · EMERGENCY</span>}
          </p>
          {data.description && (
            <div className="bg-cream rounded-xl p-4 mb-4">
              <p className="text-body text-gray-700 whitespace-pre-wrap">{data.description}</p>
            </div>
          )}

          {data.existingQuote && (
            <p className="text-caption text-amber-600 mb-3">
              You previously quoted {formatCurrency(data.existingQuote.amount, data.currency)} — submitting again updates your quote.
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-label uppercase text-gray-500 block mb-1">Your quote ({data.currency})</label>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-body tabular-nums focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-label uppercase text-gray-500 block mb-1">Earliest available date <span className="normal-case">(optional)</span></label>
              <input
                type="date" value={availableDate}
                onChange={(e) => setAvailableDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-body focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-label uppercase text-gray-500 block mb-1">Notes <span className="normal-case">(optional — scope, materials, exclusions)</span></label>
              <textarea
                value={note} rows={3}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-body focus:outline-none focus:border-gold resize-none"
              />
            </div>
          </div>

          {error && <p className="text-caption text-expense mt-3">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || !amount}
            className="w-full mt-4 py-3 rounded-xl text-body font-semibold bg-gold text-header hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            {submitting ? "Submitting…" : data.existingQuote ? "Update quote" : "Submit quote"}
          </button>
          <p className="text-caption text-gray-400 text-center mt-3">
            Submitting as {data.vendorName}. Your quote goes straight onto the job&apos;s case record.
          </p>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">{children}</div>
    </div>
  );
}
