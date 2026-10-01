"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { CalendarClock, Download, Loader2, Mail, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date-utils";
import { describeEscalation, type EscalationTerms, type ReviewState } from "@/lib/rent-escalation";
import { TutorialVideo } from "@/components/ui/TutorialVideo";

interface ReviewPayload {
  terms: EscalationTerms;
  hasTerms: boolean;
  noticeDays: number;
  currentRent: number;
  isActive: boolean;
  hasEmail: boolean;
  review: {
    reviewDate: string;
    noticeDeadline: string;
    state: ReviewState;
    baseRent: number;
    proposedRent: number;
    proposedEffectiveDate: string;
    missedReviews: number;
  } | null;
  scheduled: {
    id: string;
    monthlyRent: number;
    effectiveDate: string;
    reason: string | null;
    noticeSentAt: string | null;
    createdByName: string | null;
  }[];
}

const ymd = (iso: string) => iso.slice(0, 10);
const localYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STATE_STYLE: Record<ReviewState, string> = {
  none: "bg-gray-100 text-gray-600",
  upcoming: "bg-amber-100 text-amber-700",
  notice_late: "bg-red-100 text-red-700",
  overdue: "bg-red-100 text-red-700",
};

/**
 * Rent review for one lease: its increase terms, the next review, a proposal
 * the manager can adjust and schedule, and any scheduled increase with its
 * notice (download / email / cancel). Sits at the top of the Rent History tab.
 */
export function RentReviewCard({ tenantId, currency, onChanged }: { tenantId: string; currency: string; onChanged: () => void }) {
  const fmt = (n: number) => formatCurrency(n, currency);
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newRent, setNewRent] = useState("");
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    fetch(`/api/tenants/${tenantId}/rent-increase`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ReviewPayload | null) => {
        setData(d);
        if (d?.review) {
          setNewRent(String(d.review.proposedRent));
          setEffective(localYmd(d.review.proposedEffectiveDate));
          setReason(`Rent review (${describeEscalation(d.terms, fmt)})`);
          setShowForm(d.review.state !== "none" && d.scheduled.length === 0);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (!data || !data.isActive) return null;

  const refresh = () => { load(); onChanged(); };

  async function schedule(acceptShortNotice = false) {
    const rent = Number(newRent.replace(/,/g, ""));
    if (!(rent > 0)) { toast.error("Enter the new monthly rent"); return; }
    setBusy("schedule");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-increase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", newRent: rent, effectiveDate: effective, reason, acceptShortNotice }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.code === "SHORT_NOTICE" && !acceptShortNotice) {
        setBusy(null);
        if (confirm(`${body.error}\n\nSchedule it anyway?`)) await schedule(true);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Could not schedule the increase");
      toast.success("Increase scheduled — now send the notice");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the increase");
    } finally {
      setBusy(null);
    }
  }

  async function skip() {
    const note = prompt("No increase at this review. Add a note (optional):", "");
    if (note === null) return;
    setBusy("skip");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-increase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not record the review");
      toast.success("Review recorded — no increase");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the review");
    } finally {
      setBusy(null);
    }
  }

  async function emailNotice(id: string) {
    setBusy(`email:${id}`);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-increase/${id}/notice/email`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not email the notice");
      toast.success(`Notice emailed to ${body.sentTo}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not email the notice");
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this scheduled increase? The rent stays as it is.")) return;
    setBusy(`cancel:${id}`);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-increase/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not cancel");
      toast.success("Scheduled increase cancelled");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  }

  if (!data.hasTerms && data.scheduled.length === 0) {
    return (
      <div className="mb-5 px-4 py-3 rounded-xl border border-dashed border-gray-200 text-caption text-gray-500 flex items-start gap-2">
        <TrendingUp size={14} className="mt-0.5 text-gray-400 shrink-0" />
        <span>
          No rent increase terms on this lease. Add them with <strong>Edit tenant</strong> (Rent Increase, Every, First Review) and
          the app will remind you before each review, draft the notice, and switch the rent on the day.{" "}
          <TutorialVideo tutorialKey="rent-increases" variant="link" />
        </span>
      </div>
    );
  }

  const r = data.review;
  const stateLabel = r
    ? r.state === "overdue"
      ? `Review overdue since ${formatDate(r.reviewDate)}`
      : r.state === "notice_late"
        ? `Notice deadline ${formatDate(r.noticeDeadline)} has passed`
        : r.state === "upcoming"
          ? `Send notice by ${formatDate(r.noticeDeadline)}`
          : `Next review ${formatDate(r.reviewDate)}`
    : null;

  const rentNum = Number(newRent.replace(/,/g, ""));
  const base = r?.baseRent ?? data.currentRent;
  const diff = rentNum - base;

  return (
    <div className="mb-5 rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-label font-medium text-gold-dark uppercase">Rent review</p>
          <p className="text-body text-header mt-0.5">
            {data.hasTerms ? describeEscalation(data.terms, fmt) : "No increase terms"} · {data.noticeDays} days&apos; notice
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {r && stateLabel && (
            <span className={clsx("inline-flex items-center gap-1 text-caption font-medium px-2.5 py-1 rounded-full", STATE_STYLE[r.state])}>
              <CalendarClock size={12} />
              {stateLabel}
            </span>
          )}
          <TutorialVideo tutorialKey="rent-increases" variant="link" />
        </div>
      </div>

      {r && r.missedReviews > 0 && (
        <p className="text-caption text-gray-500">
          {r.missedReviews} earlier review{r.missedReviews > 1 ? "s have" : " has"} no increase recorded. If the rent was raised then,
          add it below with <strong>Log Rent Change</strong> so the history is complete.
        </p>
      )}

      {data.scheduled.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-100 rounded-lg px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-body text-header">
              <span className="tabular-nums font-semibold">{fmt(s.monthlyRent)}</span> from {formatDate(s.effectiveDate)}
              <span className="ml-2 text-caption text-gray-400">scheduled</span>
            </p>
            <p className={clsx("text-caption mt-0.5", s.noticeSentAt ? "text-income" : "text-amber-700")}>
              {s.noticeSentAt ? `Notice emailed ${formatDate(s.noticeSentAt)}` : "Notice not emailed yet — email it, or download and deliver it"}
              {" · "}the rent switches automatically on the day; invoices for that month already bill it.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={`/api/tenants/${tenantId}/rent-increase/${s.id}/notice`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-caption text-gray-600 hover:bg-gray-50"
            >
              <Download size={12} /> Notice
            </a>
            <button
              onClick={() => emailNotice(s.id)}
              disabled={!data.hasEmail || busy !== null}
              title={data.hasEmail ? "Email the notice (PDF attached) and log it on Comms" : "No email address on this tenant"}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gold text-white rounded-lg text-caption font-medium hover:bg-gold-dark disabled:opacity-50"
            >
              {busy === `email:${s.id}` ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              {s.noticeSentAt ? "Email again" : "Email notice"}
            </button>
            <button
              onClick={() => cancel(s.id)}
              disabled={busy !== null}
              title="Cancel this scheduled increase"
              className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      {r && data.scheduled.length === 0 && !showForm && (
        <button onClick={() => setShowForm(true)} className="text-caption font-medium text-gold-dark hover:underline">
          Prepare the increase now →
        </button>
      )}

      {r && data.scheduled.length === 0 && showForm && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-caption text-gray-500 mb-1">New monthly rent</label>
              <input
                type="number"
                min="0"
                value={newRent}
                onChange={(e) => setNewRent(e.target.value)}
                aria-label="New monthly rent"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              {rentNum > 0 && (
                <p className="text-caption text-gray-500 mt-1 tabular-nums">
                  {fmt(base)} → {fmt(rentNum)} ({diff >= 0 ? "+" : ""}{fmt(diff)}{base > 0 ? `, ${((diff / base) * 100).toFixed(1)}%` : ""})
                </p>
              )}
            </div>
            <div>
              <label className="block text-caption text-gray-500 mb-1">Effective from</label>
              <input
                type="date"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
                aria-label="Increase effective from"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-white focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              {ymd(r.proposedEffectiveDate) !== ymd(r.reviewDate) && (
                <p className="text-caption text-amber-700 mt-1">Moved from the review date to give full notice.</p>
              )}
            </div>
            <div>
              <label className="block text-caption text-gray-500 mb-1">Reason</label>
              <input
                type="text"
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-white focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
          <p className="text-caption text-gray-500">
            Invoices bill the whole month the increase lands in, so the 1st of a month is usually the right date.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => schedule()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gold text-white rounded-lg text-body font-medium hover:bg-gold-dark disabled:opacity-50"
            >
              {busy === "schedule" ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />}
              Schedule increase
            </button>
            <button
              onClick={skip}
              disabled={busy !== null}
              className="px-4 py-2 border border-gray-200 rounded-lg text-body text-gray-600 hover:bg-white disabled:opacity-50"
            >
              No increase this time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
