"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { KEY_PRESETS, type InspectionKey, type InspectionType, type KeysState } from "@/lib/inspection-rules";
import { KeyRound, Minus, Plus, X } from "lucide-react";

/**
 * Keys handed over (move-in) or returned (move-out). On a move-in the step
 * stays locked until a manager confirms the deposit and first rent are paid.
 */
export function KeysEditor({ reportType, state, keys, onSave, saving, onClearKeys, clearing }: {
  reportType: InspectionType;
  state: KeysState;
  keys: InspectionKey[];
  onSave: (keys: InspectionKey[]) => void;
  saving?: boolean;
  /** Managers only: confirm the deposit and first rent are paid. */
  onClearKeys?: () => void;
  clearing?: boolean;
}) {
  const [custom, setCustom] = useState("");
  if (state === "none") return null;

  const heading = reportType === "MOVE_OUT" ? "Keys returned" : "Keys handed over";

  if (state === "waiting" && onClearKeys) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-body text-amber-800 space-y-2">
        <p className="flex gap-2">
          <KeyRound size={16} className="mt-0.5 shrink-0" />
          <span>Keys wait until you confirm the deposit and first rent are paid. Clearing them emails the caretaker.</span>
        </p>
        <Button type="button" size="sm" onClick={onClearKeys} loading={clearing}>Deposit &amp; rent paid — clear keys</Button>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-body text-amber-800 flex gap-2">
        <KeyRound size={16} className="mt-0.5 shrink-0" />
        <span>
          <strong>Don&apos;t hand over the keys yet.</strong> The manager will confirm the deposit and first rent are paid,
          and you&apos;ll get an email when you can.
        </span>
      </div>
    );
  }

  const locked = state === "locked";
  function setCount(label: string, count: number) {
    const next = keys.some((k) => k.label === label)
      ? keys.map((k) => (k.label === label ? { ...k, count } : k)).filter((k) => k.count > 0)
      : count > 0 ? [...keys, { label, count }] : keys;
    onSave(next);
  }
  const labels = Array.from(new Set([...KEY_PRESETS, ...keys.map((k) => k.label)]));

  return (
    <div className="space-y-2">
      <p className="text-body font-medium text-gray-700 flex items-center gap-1.5"><KeyRound size={14} /> {heading}</p>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {labels.map((label) => {
          const count = keys.find((k) => k.label === label)?.count ?? 0;
          const isPreset = (KEY_PRESETS as readonly string[]).includes(label);
          return (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className={count > 0 ? "text-body text-header" : "text-body text-gray-400"}>{label}</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={locked || saving || count === 0} onClick={() => setCount(label, count - 1)}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40" aria-label={`One fewer ${label}`}>
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center tabular-nums text-body">{count}</span>
                <button type="button" disabled={locked || saving} onClick={() => setCount(label, count + 1)}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40" aria-label={`One more ${label}`}>
                  <Plus size={14} />
                </button>
                {!isPreset && !locked && (
                  <button type="button" onClick={() => setCount(label, 0)} className="p-1 text-gray-300 hover:text-red-500" aria-label={`Remove ${label}`}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!locked && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other key (e.g. Store room)"
            className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <Button type="button" variant="ghost" size="sm" disabled={!custom.trim()}
            onClick={() => { setCount(custom.trim().slice(0, 60), 1); setCustom(""); }}>
            <Plus size={14} /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
