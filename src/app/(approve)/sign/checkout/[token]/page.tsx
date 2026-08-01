"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/currency";

interface SignView {
  expired: boolean;
  signed: boolean;
  signedName: string | null;
  signedAt: string | null;
  tenantName: string;
  propertyName: string;
  orgName: string;
  unitNumber: string;
  currency: string;
  checkOutDate: string;
  originalDeposit: number;
  depositReceived: number | null;
  rentBalanceOwing: number;
  deductions: { description: string; amount: number }[];
  totalDeductions: number;
  balanceToRefund: number;
}

export default function SignCheckoutPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<SignView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sign/checkout/${token}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => setNotFound(true));
  }, [token]);

  async function submit() {
    if (!name.trim() || !agreed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/checkout/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not record your acknowledgment"); return; }
      setDone(true);
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
        <p className="text-gray-500">This sign-off link is invalid or has been replaced.</p>
      </Centered>
    );
  }
  if (!data) return <Centered><p className="text-gray-500">Loading…</p></Centered>;

  if (done || data.signed) {
    return (
      <Centered>
        <div className="text-income text-h1 mb-2">✓</div>
        <h1 className="text-h1 mb-2">Thank you</h1>
        <p className="text-gray-500">
          The check-out settlement for Unit {data.unitNumber}, {data.propertyName} has been
          acknowledged{data.signedName ? ` by ${data.signedName}` : ""}. You can close this page.
        </p>
      </Centered>
    );
  }

  if (data.expired) {
    return (
      <Centered>
        <h1 className="text-h1 mb-2">Link expired</h1>
        <p className="text-gray-500">This sign-off link has expired. Please ask {data.orgName} to send a new one.</p>
      </Centered>
    );
  }

  const fmt = (n: number) => formatCurrency(n, data.currency);
  const refundDue = data.balanceToRefund >= 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-label uppercase text-gray-400 mb-1">{data.orgName}</p>
          <h1 className="text-h2 text-header mb-1">Check-out settlement</h1>
          <p className="text-body text-gray-500 mb-5">
            {data.tenantName} · Unit {data.unitNumber}, {data.propertyName} ·{" "}
            {new Date(data.checkOutDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>

          <div className="space-y-2 mb-5">
            <Row label="Deposit held" value={fmt(data.depositReceived ?? data.originalDeposit)} />
            {data.rentBalanceOwing > 0 && (
              <Row label="Unpaid rent" value={`(${fmt(data.rentBalanceOwing)})`} negative />
            )}
            {data.deductions.map((d, i) => (
              <Row key={i} label={d.description} value={`(${fmt(d.amount)})`} negative />
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
              <span className="text-body font-semibold text-header">
                {refundDue ? "Refund due to you" : "Balance owing to landlord"}
              </span>
              <span className={`tabular-nums text-h3 ${refundDue ? "text-income" : "text-expense"}`}>
                {fmt(Math.abs(data.balanceToRefund))}
              </span>
            </div>
          </div>

          <div className="bg-cream rounded-xl p-4 mb-4">
            <label className="text-label uppercase text-gray-500 block mb-1.5">Type your full name to acknowledge</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-body bg-white focus:outline-none focus:border-gold"
            />
            <label className="flex items-start gap-2 mt-3 text-caption text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              I confirm I have reviewed this settlement and agree that typing my name here acts as my signature.
            </label>
          </div>

          {error && <p className="text-caption text-expense mb-3">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !agreed}
            className="w-full py-3 rounded-xl text-body font-semibold bg-gold text-header hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            {submitting ? "Recording…" : "Acknowledge check-out"}
          </button>
          <p className="text-caption text-gray-400 text-center mt-3">
            Your name and the time of acknowledgment are recorded and appear on the check-out document.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50">
      <span className="text-body text-gray-600">{label}</span>
      <span className={`tabular-nums text-body ${negative ? "text-expense" : "text-header"}`}>{value}</span>
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
