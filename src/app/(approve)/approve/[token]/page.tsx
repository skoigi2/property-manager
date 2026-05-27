"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/currency";

interface ApprovalView {
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISPUTED" | "EXPIRED";
  question: string;
  amount: number | null;
  currency: string | null;
  caseTitle: string;
  propertyName: string;
  unitNumber: string | null;
  requestedByName: string | null;
  expiresAt: string;
  respondedAt: string | null;
  respondedByName: string | null;
}

export default function ApprovePage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const isDisputeFlow = searchParams.get("dispute") === "1";
  const token = params.token;

  const [data, setData] = useState<ApprovalView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ status: string; at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/approvals/${token}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => setNotFound(true));
  }, [token]);

  async function respond(action: "APPROVE" | "REJECT" | "DISPUTE") {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, respondedByName: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not record your response");
        return;
      }
      setSubmitted({ status: json.status, at: json.respondedAt ?? json.disputedAt ?? new Date().toISOString() });
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <Centered>
        <h1 className="font-display text-2xl mb-2">Link not found</h1>
        <p className="text-gray-500">This approval link is invalid or has been deleted.</p>
      </Centered>
    );
  }

  if (!data) {
    return <Centered><p className="text-gray-500">Loading…</p></Centered>;
  }

  if (submitted) {
    return (
      <Centered>
        <h1 className="font-display text-2xl mb-2">Thank you</h1>
        <p className="text-gray-700">Your response <strong>{submitted.status}</strong> has been recorded.</p>
        <p className="text-gray-400 text-sm mt-3">{new Date(submitted.at).toLocaleString()}</p>
      </Centered>
    );
  }

  if (data.status === "EXPIRED") {
    return (
      <Centered>
        <h1 className="font-display text-2xl mb-2">Approval expired</h1>
        <p className="text-gray-500">This approval request expired on {new Date(data.expiresAt).toLocaleString()}.</p>
      </Centered>
    );
  }

  if (data.status !== "PENDING") {
    // Already responded — show the recorded decision (or dispute form)
    if (isDisputeFlow && (data.status === "APPROVED" || data.status === "REJECTED")) {
      return (
        <Centered>
          <h1 className="font-display text-2xl mb-2">Flag this approval</h1>
          <p className="text-gray-700 mb-4">Confirm that the previous response was not made by you. This will reopen the case for manager review.</p>
          <div className="space-y-3 text-left max-w-md mx-auto">
            <label className="block text-sm">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Type your full name"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={!name.trim() || submitting}
              onClick={() => respond("DISPUTE")}
              className="w-full bg-red-600 text-white py-2 rounded-lg font-medium disabled:opacity-50"
            >
              Yes, this wasn't me — flag for review
            </button>
          </div>
        </Centered>
      );
    }
    return (
      <Centered>
        <h1 className="font-display text-2xl mb-2">Already responded</h1>
        <p className="text-gray-700">This approval was {data.status.toLowerCase()} by <strong>{data.respondedByName ?? "someone"}</strong></p>
        {data.respondedAt && <p className="text-gray-400 text-sm mt-2">on {new Date(data.respondedAt).toLocaleString()}.</p>}
      </Centered>
    );
  }

  // PENDING — show the approval form
  return (
    <Centered wide>
      <h1 className="font-display text-2xl mb-1">Approval requested</h1>
      <p className="text-gray-500 text-sm mb-6">
        {data.requestedByName ? `${data.requestedByName} has` : "Your property manager has"} requested your sign-off.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-5 text-left mb-6">
        <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Question</p>
        <p className="text-gray-900 whitespace-pre-wrap">{data.question}</p>

        {data.amount != null && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Amount</p>
            <p className="text-2xl font-semibold text-gray-900">{formatCurrency(data.amount, data.currency ?? "USD")}</p>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500">
          <p>{data.propertyName}{data.unitNumber ? ` · Unit ${data.unitNumber}` : ""}</p>
          <p>Case: {data.caseTitle}</p>
          <p className="text-xs text-gray-400 mt-2">Expires {new Date(data.expiresAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-3 text-left">
        <label className="block text-sm font-medium text-gray-700">Your name (for the record)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="Type your full name"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            disabled={!name.trim() || submitting}
            onClick={() => respond("REJECT")}
            className="bg-red-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            Reject
          </button>
          <button
            disabled={!name.trim() || submitting}
            onClick={() => respond("APPROVE")}
            className="bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </Centered>
  );
}

function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className={`${wide ? "max-w-xl" : "max-w-md"} w-full text-center`}>{children}</div>
    </div>
  );
}
