"use client";
import { useState } from "react";
import { CheckCircle2, Circle, Loader2, ChevronRight, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { formatDate } from "@/lib/date-utils";

type Stage = "NONE" | "NOTICE_SENT" | "TERMS_AGREED" | "RENEWED";

interface Props {
  tenantId:        string;
  currentStage:    Stage;
  proposedRent:    number | null;
  proposedLeaseEnd: string | null;
  renewalNotes:    string | null;
  currentRent:     number;
  currentLeaseEnd: string | null;
  onUpdated:       () => void;
  onRenewed?:      () => void;
}

const STAGES: { value: Stage; label: string; description: string }[] = [
  { value: "NOTICE_SENT",  label: "Notice Sent",   description: "Renewal notice sent to tenant" },
  { value: "TERMS_AGREED", label: "Terms Agreed",  description: "New terms negotiated and agreed" },
  { value: "RENEWED",      label: "Renewed",        description: "Lease renewed — records updated" },
];

export function RenewalPipeline({
  tenantId,
  currentStage,
  proposedRent,
  proposedLeaseEnd,
  renewalNotes,
  currentRent,
  currentLeaseEnd,
  onUpdated,
  onRenewed,
}: Props) {
  const [saving, setSaving]             = useState(false);
  const [editProposedRent, setEditProposedRent] = useState(String(proposedRent ?? currentRent));
  const [editLeaseEnd, setEditLeaseEnd]   = useState(
    proposedLeaseEnd
      ? proposedLeaseEnd.slice(0, 10)
      : currentLeaseEnd
      ? new Date(new Date(currentLeaseEnd).setFullYear(new Date(currentLeaseEnd).getFullYear() + 1))
          .toISOString()
          .slice(0, 10)
      : ""
  );
  const [editNotes, setEditNotes]       = useState(renewalNotes ?? "");

  async function advance(toStage: Stage) {
    setSaving(true);
    try {
      await fetch(`/api/tenants/${tenantId}/renewal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renewalStage:     toStage,
          proposedRent:     parseFloat(editProposedRent) || null,
          proposedLeaseEnd: editLeaseEnd || null,
          renewalNotes:     editNotes || null,
        }),
      });
      onUpdated();
      if (toStage === "RENEWED" && onRenewed) onRenewed();
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
          renewalStage:     "NONE",
          proposedRent:     null,
          proposedLeaseEnd: null,
          renewalNotes:     null,
        }),
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.value === currentStage);
  const isRenewed  = currentStage === "RENEWED";

  return (
    <div className="space-y-4">
      {/* Stage stepper */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const passed  = stageIndex >= i;
          return (
            <div key={stage.value} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1 gap-1">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  passed  ? "bg-income text-white"
                          : "bg-gray-100 text-gray-400",
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

      {/* Proposed terms form (always visible for editing) */}
      {!isRenewed && (
        <div className="bg-cream rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">Proposed Terms</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-sans">New Monthly Rent (KSh)</label>
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
              New rent: <span className="font-mono font-medium">KSh {proposedRent.toLocaleString("en-KE")}</span>
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

        {/* Save changes to proposed terms (any non-renewed stage) */}
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
    </div>
  );
}
