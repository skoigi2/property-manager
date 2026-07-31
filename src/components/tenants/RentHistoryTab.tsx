"use client";

import { useState, useEffect, useCallback } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { resolveExpectedRent, isRentHistoryOutOfSync } from "@/lib/rent-resolution";

interface RentHistoryEntry {
  id: string;
  monthlyRent: number;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
}

interface RentHistoryTabProps {
  tenantId: string;
  currentRent: number;
  currency: string;
}

export function RentHistoryTab({ tenantId, currentRent, currency }: RentHistoryTabProps) {
  const fmt = (n: number) => formatCurrency(n, currency);

  const [history, setHistory]     = useState<RentHistoryEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm]   = useState(false);
  const [formRent, setFormRent]   = useState(String(currentRent));
  const [formDate, setFormDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/rent-history`)
      .then((r) => r.json())
      .then((d) => { setHistory(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const rent = parseFloat(formRent);
    if (!rent || rent <= 0) { toast.error("Enter a valid rent amount"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyRent: rent,
          effectiveDate: formDate,
          reason: formReason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Rent history entry added");
      setShowForm(false);
      setFormReason("");
      fetchHistory();
    } catch {
      toast.error("Failed to add entry");
    } finally {
      setSubmitting(false);
    }
  }

  // One-click fix for an out-of-sync timeline: record the current rent as of
  // today so ledgers/reports stop resolving a stale historical rate.
  const [syncing, setSyncing] = useState(false);
  async function handleSyncCurrentRent() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyRent: currentRent,
          effectiveDate: format(new Date(), "yyyy-MM-dd"),
          reason: "Synced with current rent",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Current rent recorded in history");
      fetchHistory();
    } catch {
      toast.error("Failed to record entry");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm("Delete this rent history entry?")) return;
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-history?entryId=${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setHistory((h) => h.filter((e) => e.id !== entryId));
      toast.success("Entry deleted");
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  // Build display list: history entries + current rent sentinel for comparison
  // Sorted ascending by effectiveDate for delta calculation
  const sorted = [...history].sort(
    (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
  );

  function getDelta(index: number): number | null {
    if (index === 0) return null;
    return sorted[index].monthlyRent - sorted[index - 1].monthlyRent;
  }

  // Display in descending order (newest first)
  const displayEntries = [...sorted].reverse();

  // Timeline vs live field disagreement — the resolved rate drives ledgers,
  // reports, and invoices, so a stale timeline silently bills the old rent.
  const resolvedNow = resolveExpectedRent(sorted, currentRent, new Date());
  const outOfSync = isRentHistoryOutOfSync(sorted, currentRent);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="section-header">Rent History</h2>
        <button
          onClick={() => { setShowForm((v) => !v); setFormRent(String(currentRent)); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-white text-caption font-medium rounded-lg hover:bg-gold-dark transition-colors"
        >
          <Plus size={13} />
          Log Rent Change
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mb-5 p-4 border border-gold/30 bg-gold/5 rounded-xl space-y-3"
        >
          <p className="text-label font-medium text-gold-dark uppercase ">New Rent Entry</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption text-gray-500 mb-1">Monthly Rent</label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={formRent}
                onChange={(e) => setFormRent(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="block text-caption text-gray-500 mb-1">Effective Date</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-caption text-gray-500 mb-1">Reason <span className="text-gray-400">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Annual escalation, lease renewal, market adjustment"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              maxLength={200}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-body text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gold text-white rounded-lg text-body font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Entry"}
            </button>
          </div>
        </form>
      )}

      {/* Out-of-sync warning — timeline resolves a different rate than the
          tenant's current rent, so ledgers/reports use the stale figure */}
      {outOfSync && (
        <div className="flex items-start gap-3 px-4 py-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-amber-800">Rent history out of sync</p>
            <p className="text-caption text-amber-700 mt-0.5">
              The history timeline resolves this month&apos;s rent as <span className="tabular-nums font-semibold">{fmt(resolvedNow)}</span>,
              but the tenant&apos;s current rent is <span className="tabular-nums font-semibold">{fmt(currentRent)}</span>.
              Ledgers, reports, and invoices use the timeline — either correct an entry below
              (e.g. set the right effective date), or record the current rent now.
            </p>
            <button
              onClick={handleSyncCurrentRent}
              disabled={syncing}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-caption font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {syncing ? <><Loader2 size={12} className="animate-spin" /> Recording…</> : <>Record {fmt(currentRent)} as of today</>}
            </button>
          </div>
        </div>
      )}

      {/* Current rent banner */}
      <div className="flex items-center justify-between px-4 py-3 bg-cream-dark rounded-xl mb-4">
        <div>
          <p className="text-label text-gray-400 uppercase ">Current Monthly Rent</p>
          <p className="text-h3 tabular-nums text-header mt-0.5">{fmt(currentRent)}</p>
        </div>
        {sorted.length > 0 && (() => {
          const prev = sorted[sorted.length - 1].monthlyRent;
          const delta = currentRent - prev;
          if (delta === 0) return null;
          return (
            <div className={clsx(
              "flex items-center gap-1 text-body tabular-nums font-medium px-3 py-1.5 rounded-lg",
              delta > 0 ? "text-income bg-emerald-50" : "text-expense bg-red-50",
            )}>
              {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {delta > 0 ? "+" : ""}{fmt(delta)} vs last record
            </div>
          );
        })()}
      </div>

      {/* History timeline */}
      {displayEntries.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <TrendingUp size={28} className="mx-auto mb-2 opacity-20" />
          <p className="text-body ">No rent history recorded yet.</p>
          <p className="text-caption mt-1">Use &quot;Log Rent Change&quot; to track escalations and adjustments.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-0">
            {displayEntries.map((entry, displayIdx) => {
              // Find this entry's position in the sorted array for delta
              const sortedIdx = sorted.findIndex((e) => e.id === entry.id);
              const delta = getDelta(sortedIdx);
              const isLatest = displayIdx === 0;

              return (
                <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0 group">
                  {/* Dot */}
                  <div className={clsx(
                    "relative z-10 mt-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0",
                    isLatest ? "border-gold bg-gold" : "border-gray-300 bg-white",
                  )}>
                    {delta === null ? (
                      <Minus size={9} className={isLatest ? "text-white" : "text-gray-400"} />
                    ) : delta > 0 ? (
                      <TrendingUp size={9} className={isLatest ? "text-white" : "text-income"} />
                    ) : (
                      <TrendingDown size={9} className={isLatest ? "text-white" : "text-expense"} />
                    )}
                  </div>

                  {/* Content */}
                  <div className={clsx(
                    "flex-1 rounded-xl px-4 py-3 border transition-colors group-hover:border-gray-200",
                    isLatest ? "border-gold/30 bg-gold/5" : "border-gray-100 bg-white",
                  )}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tabular-nums text-h3 text-header">
                            {fmt(entry.monthlyRent)}
                          </span>
                          {delta !== null && delta !== 0 && (
                            <span className={clsx(
                              "flex items-center gap-0.5 text-caption tabular-nums font-medium px-2 py-0.5 rounded-full",
                              delta > 0 ? "text-income bg-emerald-50" : "text-expense bg-red-50",
                            )}>
                              {delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {delta > 0 ? "+" : ""}{fmt(delta)}
                              {" "}
                              ({delta > 0 ? "+" : ""}{((delta / sorted[sortedIdx - 1].monthlyRent) * 100).toFixed(1)}%)
                            </span>
                          )}
                          {delta === null && (
                            <span className="text-caption text-gray-400 italic">Initial rent</span>
                          )}
                        </div>
                        {entry.reason && (
                          <p className="text-caption text-gray-500 mt-1">{entry.reason}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-caption text-gray-500">
                            {format(new Date(entry.effectiveDate), "d MMM yyyy")}
                          </p>
                          <p className="text-caption text-gray-400 mt-0.5">
                            Logged {format(new Date(entry.createdAt), "d MMM yyyy")}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          title="Delete entry"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-expense hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {deletingId === entry.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* "How to use" hint at bottom */}
          {displayEntries.length > 0 && (
            <div className="flex items-center gap-1.5 mt-4 text-caption text-gray-400 ">
              <ChevronRight size={12} />
              {displayEntries.length} rent change{displayEntries.length !== 1 ? "s" : ""} recorded since lease start
            </div>
          )}
        </div>
      )}
    </div>
  );
}
