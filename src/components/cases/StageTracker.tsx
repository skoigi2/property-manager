"use client";
import { useState } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { CaseWorkflow } from "@/lib/case-workflows";

interface Props {
  workflow: CaseWorkflow;
  currentStageIndex: number;
  waitingOn: string;
  onAdvance: (toIndex: number, note?: string) => Promise<void> | void;
  onRegress: (reason: string) => Promise<void> | void;
  readOnly?: boolean;
}

export function StageTracker({ workflow, currentStageIndex, onAdvance, onRegress, readOnly }: Props) {
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [regressOpen, setRegressOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function startAdvance(idx: number) {
    if (readOnly || idx <= currentStageIndex) return;
    setNote("");
    setConfirmIndex(idx);
  }

  async function confirmAdvance() {
    if (confirmIndex === null) return;
    setBusy(true);
    try {
      await onAdvance(confirmIndex, note || undefined);
      setConfirmIndex(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRegress() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onRegress(reason);
      setRegressOpen(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  const stages = workflow.stages;
  const targetStage = confirmIndex !== null ? stages[confirmIndex] : null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide text-gray-400 font-sans">Progress</p>
        {!readOnly && (
          <div className="relative">
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-50"
              aria-label="More"
            >
              <MoreHorizontal size={16} />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg z-50 text-xs font-sans">
                <button
                  onClick={() => { setOverflowOpen(false); setRegressOpen(true); }}
                  className="px-3 py-2 text-left hover:bg-gray-50 whitespace-nowrap"
                  disabled={currentStageIndex === 0}
                >
                  Regress one stage
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Horizontal stepper (md+) */}
      <div className="hidden md:flex items-center overflow-x-auto">
        {stages.map((s, idx) => {
          const isDone = idx < currentStageIndex;
          const isCurrent = idx === currentStageIndex;
          const isFuture = idx > currentStageIndex;
          const clickable = !readOnly && isFuture;
          return (
            <div key={s.key} className="flex items-center shrink-0">
              <button
                onClick={() => clickable && startAdvance(idx)}
                disabled={!clickable}
                className={clsx(
                  "flex flex-col items-center gap-1 min-w-[6.5rem]",
                  clickable && "cursor-pointer hover:opacity-80",
                  !clickable && "cursor-default",
                )}
              >
                <span
                  className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium font-sans",
                    isDone && "bg-green-500 text-white",
                    isCurrent && "bg-gold text-white ring-4 ring-gold/20",
                    isFuture && "bg-gray-200 text-gray-500",
                  )}
                >
                  {isDone ? <Check size={14} /> : idx + 1}
                </span>
                <span
                  className={clsx(
                    "text-[11px] text-center leading-tight font-sans px-1",
                    isCurrent && "text-gold font-medium",
                    isDone && "text-gray-600",
                    isFuture && "text-gray-400",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {idx < stages.length - 1 && (
                <div className={clsx("h-0.5 w-6 mx-1", idx < currentStageIndex ? "bg-green-500" : "bg-gray-200")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Vertical stepper (mobile) */}
      <div className="md:hidden space-y-2">
        {stages.map((s, idx) => {
          const isDone = idx < currentStageIndex;
          const isCurrent = idx === currentStageIndex;
          const isFuture = idx > currentStageIndex;
          const clickable = !readOnly && isFuture;
          return (
            <button
              key={s.key}
              onClick={() => clickable && startAdvance(idx)}
              disabled={!clickable}
              className={clsx(
                "flex items-center gap-3 w-full text-left p-2 rounded-lg",
                clickable && "hover:bg-gray-50",
              )}
            >
              <span
                className={clsx(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium font-sans shrink-0",
                  isDone && "bg-green-500 text-white",
                  isCurrent && "bg-gold text-white",
                  isFuture && "bg-gray-200 text-gray-500",
                )}
              >
                {isDone ? <Check size={12} /> : idx + 1}
              </span>
              <span
                className={clsx(
                  "text-sm font-sans",
                  isCurrent && "text-gold font-medium",
                  isDone && "text-gray-600",
                  isFuture && "text-gray-400",
                )}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Confirm advance modal */}
      {confirmIndex !== null && targetStage && (
        <Modal open onClose={() => setConfirmIndex(null)} title={`Advance to "${targetStage.label}"?`} size="sm">
          <div className="p-5 space-y-3">
            <label className="block text-xs uppercase tracking-wide text-gray-400 font-sans">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add context for the audit log"
              className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConfirmIndex(null)}>Cancel</Button>
              <Button variant="gold" onClick={confirmAdvance} loading={busy}>Advance</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Regress modal */}
      {regressOpen && (
        <Modal open onClose={() => setRegressOpen(false)} title="Regress one stage" size="sm">
          <div className="p-5 space-y-3">
            <label className="block text-xs uppercase tracking-wide text-gray-400 font-sans">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this case going back a stage?"
              className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setRegressOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={confirmRegress} loading={busy} disabled={!reason.trim()}>Regress</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
