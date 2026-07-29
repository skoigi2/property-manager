"use client";

import { useState } from "react";
import { format, subMonths } from "date-fns";
import { Download, Loader2, CalendarRange } from "lucide-react";
import { MonthPicker } from "./MonthPicker";
import { Modal } from "./Modal";

export interface ExportRange {
  /** Null bound = unbounded (All history exports pass null/null). */
  from: Date | null;
  to: Date | null;
  /** Filename-safe period label, e.g. "Jul-2026", "2026-01_2026-07", "All-History". */
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** The month currently shown on the page — used for the first preset. */
  selectedMonth: Date;
  /** Runs the actual export; the dialog shows a spinner until it resolves. */
  onExport: (range: ExportRange) => Promise<void> | void;
}

/** YYYY-MM-DD in local time — the format the from/to API params expect. */
export function toYmd(d: Date) { return format(d, "yyyy-MM-dd"); }

function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function monthLabel(d: Date) { return format(d, "MMM-yyyy"); }

export function ExportRangeDialog({ open, onClose, title = "Export", selectedMonth, onExport }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date>(() => monthStart(subMonths(selectedMonth, 2)));
  const [customTo, setCustomTo] = useState<Date>(() => monthStart(selectedMonth));

  const now = new Date();
  const prevMonth = subMonths(monthStart(selectedMonth), 1);

  const presets: { key: string; name: string; hint: string; range: () => ExportRange }[] = [
    {
      key: "selected",
      name: `Selected month (${format(selectedMonth, "MMMM yyyy")})`,
      hint: "What's currently shown on the page",
      range: () => ({ from: monthStart(selectedMonth), to: monthEnd(selectedMonth), label: monthLabel(selectedMonth) }),
    },
    {
      key: "previous",
      name: `Previous month (${format(prevMonth, "MMMM yyyy")})`,
      hint: "The month before the selected one",
      range: () => ({ from: monthStart(prevMonth), to: monthEnd(prevMonth), label: monthLabel(prevMonth) }),
    },
    {
      key: "ytd",
      name: `Year to date (${now.getFullYear()})`,
      hint: `Jan ${now.getFullYear()} through today`,
      range: () => ({ from: new Date(now.getFullYear(), 0, 1), to: monthEnd(now), label: `YTD-${now.getFullYear()}` }),
    },
    {
      key: "12m",
      name: "Last 12 months",
      hint: `${format(subMonths(now, 11), "MMM yyyy")} – ${format(now, "MMM yyyy")}`,
      range: () => ({ from: monthStart(subMonths(now, 11)), to: monthEnd(now), label: "Last-12-Months" }),
    },
    {
      key: "all",
      name: "All history",
      hint: "Every record, no date limit",
      range: () => ({ from: null, to: null, label: "All-History" }),
    },
  ];

  async function run(key: string, range: ExportRange) {
    setBusy(key);
    try {
      await onExport(range);
      onClose();
    } finally {
      setBusy(null);
    }
  }

  const customInvalid = monthStart(customFrom) > monthStart(customTo);

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => run(p.key, p.range())}
            disabled={busy !== null}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gold/50 hover:bg-cream text-left transition-colors disabled:opacity-50"
          >
            <span className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              {busy === p.key ? <Loader2 size={14} className="animate-spin text-gold" /> : <Download size={14} className="text-gold" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-sans font-medium text-header">{p.name}</span>
              <span className="block text-xs font-sans text-gray-400">{p.hint}</span>
            </span>
          </button>
        ))}

        {/* Custom range */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          disabled={busy !== null}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gold/50 hover:bg-cream text-left transition-colors disabled:opacity-50"
        >
          <span className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
            <CalendarRange size={14} className="text-gold" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-sans font-medium text-header">Custom range…</span>
            <span className="block text-xs font-sans text-gray-400">Pick a from/to month</span>
          </span>
        </button>

        {showCustom && (
          <div className="border border-gray-100 rounded-xl p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <p className="text-[11px] text-gray-400 font-sans uppercase tracking-wide mb-1">From</p>
                <MonthPicker value={customFrom} onChange={setCustomFrom} />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-gray-400 font-sans uppercase tracking-wide mb-1">To</p>
                <MonthPicker value={customTo} onChange={setCustomTo} />
              </div>
            </div>
            {customInvalid && (
              <p className="text-xs text-expense font-sans">&quot;From&quot; must be on or before &quot;To&quot;.</p>
            )}
            <button
              onClick={() =>
                run("custom", {
                  from: monthStart(customFrom),
                  to: monthEnd(customTo),
                  label: `${format(customFrom, "yyyy-MM")}_${format(customTo, "yyyy-MM")}`,
                })
              }
              disabled={busy !== null || customInvalid}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
            >
              {busy === "custom" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export {format(customFrom, "MMM yyyy")} – {format(customTo, "MMM yyyy")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
