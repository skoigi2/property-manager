"use client";
import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Loader2, ChevronRight, RotateCcw, TrendingUp, Trash2, Plus } from "lucide-react";
import { clsx } from "clsx";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";

type Stage = "NONE" | "NOTICE_SENT" | "TERMS_AGREED" | "RENEWED";

interface RentHistoryEntry {
  id: string;
  monthlyRent: number;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
}

interface Props {
  tenantId:         string;
  currentStage:     Stage;
  proposedRent:     number | null;
  proposedLeaseEnd: string | null;
  renewalNotes:     string | null;
  currentRent:      number;
  currentLeaseEnd:  string | null;
  escalationRate:   number | null;
  currency?:        string;
  onUpdated:        () => void;
  onRenewed?:       () => void;
}

const STAGES: { value: Stage; label: string; description: string }[] = [
  { value: "NOTICE_SENT",  label: "Notice Sent",  description: "Renewal notice sent to tenant" },
  { value: "TERMS_AGREED", label: "Terms Agreed", description: "New terms negotiated and agreed" },
  { value: "RENEWED",      label: "Renewed",       description: "Lease renewed — records updated" },
];

export function RenewalPipeline({
  tenantId,
  currentStage,
  proposedRent,
  proposedLeaseEnd,
  renewalNotes,
  currentRent,
  currentLeaseEnd,
  escalationRate: initialEscalationRate,
  currency = "USD",
  onUpdated,
  onRenewed,
}: Props) {
  const fmt = (n: number) => formatCurrency(n, currency);
  const [saving, setSaving] = useState(false);

  // Escalation rate drives auto-suggest
  const [escalationRate, setEscalationRate] = useState(
    initialEscalationRate != null ? String(initialEscalationRate) : ""
  );
  const suggestedRent = escalationRate
    ? Math.round(currentRent * (1 + parseFloat(escalationRate) / 100))
    : null;

  const [editProposedRent, setEditProposedRent] = useState(
    String(proposedRent ?? currentRent)
  );
  const [editLeaseEnd, setEditLeaseEnd] = useState(
    proposedLeaseEnd
      ? proposedLeaseEnd.slice(0, 10)
      : currentLeaseEnd
      ? new Date(new Date(currentLeaseEnd).setFullYear(new Date(currentLeaseEnd).getFullYear() + 1))
          .toISOString()
          .slice(0, 10)
      : ""
  );
  const [editNotes, setEditNotes] = useState(renewalNotes ?? "");

  // Rent history
  const [history, setHistory]     = useState<RentHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntryRent, setNewEntryRent]   = useState("");
  const [newEntryDate, setNewEntryDate]   = useState("");
  const [newEntryReason, setNewEntryReason] = useState("");
  const [addingSaving, setAddingSaving]   = useState(false);

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-history`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { fetchHistory(); }, [tenantId]);

  async function advance(toStage: Stage) {
    setSaving(true);
    try {
      await fetch(`/api/tenants/${tenantId}/renewal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renewalStage:      toStage,
          proposedRent:      parseFloat(editProposedRent) || null,
          proposedLeaseEnd:  editLeaseEnd || null,
          renewalNotes:      editNotes || null,
          escalationRate:    escalationRate ? parseFloat(escalationRate) : null,
          rentHistoryReason: `Annual escalation (${escalationRate ? escalationRate + "%" : "manual"})`,
        }),
      });
      onUpdated();
      if (toStage === "RENEWED") {
        fetchHistory();
        if (onRenewed) onRenewed();
      }
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("Reset the renewal workflow? This will clear all proposed terms.")) return;
    setSaving(true);
    try {
      await fetch(`/api/tenants/${tenantId}/renewal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renewalStage: "NONE",
          proposedRent: null,
          proposedLeaseEnd: null,
          renewalNotes: null,
        }),
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function addHistoryEntry() {
    if (!newEntryRent || !newEntryDate) return;
    setAddingSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/rent-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyRent:   parseFloat(newEntryRent),
          effectiveDate: newEntryDate,
          reason:        newEntryReason || null,
        }),
      });
      if (res.ok) {
        setNewEntryRent(""); setNewEntryDate(""); setNewEntryReason("");
        setShowAddEntry(false);
        fetchHistory();
      }
    } finally {
      setAddingSaving(false);
    }
  }

  async function deleteHistoryEntry(id: string) {
    if (!confirm("Remove this rent history entry?")) return;
    await fetch(`/api/tenants/${tenantId}/rent-history?entryId=${id}`, { method: "DELETE" });
    fetchHistory();
  }

  const stageIndex = STAGES.findIndex((s) => s.value === currentStage);
  const isRenewed  = currentStage === "RENEWED";

  return (
    <div className="space-y-6">
      {/* Stage stepper */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const passed = stageIndex >= i;
          return (
            <div key={stage.value} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1 gap-1">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  passed ? "bg-income text-white" : "bg-gray-100 text-gray-400",
                )}>
                  {passed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </div>
                <p className={clsx("text-xs font-sans text-center leading-tight", passed ? "text-income font-medium" : "text-gray-400")}>
                  {stage.label}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div className={clsx("h-0.5 flex-1 mx-1 mb-4 rounded-full transition-colors", stageIndex > i ? "bg-income" : "bg-gray-200")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Proposed terms form */}
      {!isRenewed && (
        <div className="bg-cream rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">Proposed Terms</p>

          {/* Escalation rate + auto-suggest */}
          <div className="flex items-end gap-3 p-3 bg-white border border-gold/20 rounded-lg">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-sans flex items-center gap-1">
                <TrendingUp size={11} className="text-gold" /> Annual Escalation Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={escalationRate}
                onChange={(e) => {
                  setEscalationRate(e.target.value);
                  const rate = parseFloat(e.target.value);
                  if (!isNaN(rate)) {
                    setEditProposedRent(String(Math.round(currentRent * (1 + rate / 100))));
                  }
                }}
                placeholder="e.g. 10"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            {suggestedRent && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 font-sans">Suggested rent</p>
                <p className="text-sm font-mono font-semibold text-gold">{fmt(suggestedRent)}</p>
                <p className="text-xs text-gray-400 font-sans">
                  +{fmt(suggestedRent - currentRent)} / mo
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-sans">New Monthly Rent</label>
              <input
                type="number"
                value={editProposedRent}
                onChange={(e) => setEditProposedRent(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-sans">New Lease End Date</label>
              <input
                type="date"
                value={editLeaseEnd}
                onChange={(e) => setEditLeaseEnd(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-sans">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              placeholder="Any negotiation notes…"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans resize-none focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
        </div>
      )}

      {/* Renewed summary */}
      {isRenewed && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-2">
          <p className="text-sm font-sans font-medium text-income flex items-center gap-2">
            <CheckCircle2 size={16} /> Lease renewed successfully
          </p>
          {proposedRent && (
            <p className="text-xs text-gray-600 font-sans">
              New rent: <span className="font-mono font-medium">{fmt(proposedRent)}</span>
            </p>
          )}
          {proposedLeaseEnd && (
            <p className="text-xs text-gray-600 font-sans">
              New lease end: <span className="font-medium">{formatDate(proposedLeaseEnd)}</span>
            </p>
          )}
          {renewalNotes && (
            <p className="text-xs text-gray-500 font-sans italic">{renewalNotes}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {currentStage === "NONE" && (
          <button
            onClick={() => advance("NOTICE_SENT")}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
            Send Notice
          </button>
        )}
        {currentStage === "NOTICE_SENT" && (
          <button
            onClick={() => advance("TERMS_AGREED")}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
            Mark Terms Agreed
          </button>
        )}
        {currentStage === "TERMS_AGREED" && (
          <button
            onClick={() => advance("RENEWED")}
            disabled={saving || !editLeaseEnd}
            className="flex items-center gap-1.5 px-4 py-2 bg-income text-white text-sm font-sans rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirm Renewal
          </button>
        )}
        {!isRenewed && currentStage !== "NONE" && (
          <button
            onClick={() => advance(currentStage)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save terms
          </button>
        )}
        {currentStage !== "NONE" && (
          <button
            onClick={reset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 text-gray-400 hover:text-expense text-xs font-sans rounded-lg transition-colors ml-auto"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {/* ── Rent History ──────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">
            Rent History
          </h3>
          <button
            onClick={() => setShowAddEntry((v) => !v)}
            className="flex items-center gap-1 text-xs text-gold hover:text-gold-dark font-sans transition-colors"
          >
            <Plus size={12} /> Add entry
          </button>
        </div>

        {/* Manual add form */}
        {showAddEntry && (
          <div className="mb-3 p-3 bg-cream rounded-xl space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 font-sans">Monthly Rent</label>
                <input
                  type="number"
                  value={newEntryRent}
                  onChange={(e) => setNewEntryRent(e.target.value)}
                  className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-sans">Effective Date</label>
                <input
                  type="date"
                  value={newEntryDate}
                  onChange={(e) => setNewEntryDate(e.target.value)}
                  className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            </div>
            <input
              type="text"
              value={newEntryReason}
              onChange={(e) => setNewEntryReason(e.target.value)}
              placeholder="Reason (e.g. Annual escalation)"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <div className="flex gap-2">
              <button
                onClick={addHistoryEntry}
                disabled={addingSaving || !newEntryRent || !newEntryDate}
                className="px-3 py-1.5 bg-gold text-white text-xs font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
              >
                {addingSaving ? <Loader2 size={12} className="animate-spin inline" /> : "Save"}
              </button>
              <button
                onClick={() => setShowAddEntry(false)}
                className="px-3 py-1.5 text-gray-500 text-xs font-sans rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {historyLoading ? (
          <p className="text-xs text-gray-400 font-sans">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-gray-400 font-sans italic">
            No rent history yet. History is recorded automatically on each renewal.
          </p>
        ) : (
          <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden">
            {history.map((entry, i) => {
              const prev = history[i + 1];
              const delta = prev ? entry.monthlyRent - prev.monthlyRent : null;
              const pct   = prev ? ((delta! / prev.monthlyRent) * 100).toFixed(1) : null;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 group"
                >
                  <div>
                    <p className="text-sm font-mono font-semibold text-header">
                      {fmt(entry.monthlyRent)}
                      {delta !== null && (
                        <span className={clsx("ml-2 text-xs font-sans font-normal", delta >= 0 ? "text-income" : "text-expense")}>
                          {delta >= 0 ? "+" : ""}{fmt(delta)} ({pct}%)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 font-sans">
                      Effective {formatDate(entry.effectiveDate)}
                      {entry.reason && <> · {entry.reason}</>}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteHistoryEntry(entry.id)}
                    className="text-gray-300 hover:text-expense transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
