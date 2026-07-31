"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { clsx } from "clsx";

interface MonthPickerProps {
  value: Date;
  onChange: (date: Date) => void;
  max?: Date;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Month stepper with a jump-to-month popover: the ‹ › arrows step one month,
 * clicking the label opens a year-paged 12-month grid so any month is at most
 * a few clicks away (no more scrolling month by month across years).
 */
export function MonthPicker({ value, onChange, max }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [gridYear, setGridYear] = useState(value.getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);

  const isAtMax = max ? value >= max : false;
  const maxMonthStart = max ? new Date(max.getFullYear(), max.getMonth(), 1) : null;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) setGridYear(value.getFullYear());
    setOpen(!open);
  }

  function pick(monthIndex: number) {
    onChange(new Date(gridYear, monthIndex, 1));
    setOpen(false);
  }

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isCurrentSelected =
    value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-2">
      <button
        onClick={() => onChange(subMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header"
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={toggleOpen}
        className="flex items-center justify-center gap-1 font-medium text-body text-header min-w-[110px] px-1 py-1 rounded-lg hover:bg-cream-dark transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Jump to a month"
      >
        {format(value, "MMMM yyyy")}
        <ChevronDown size={13} className={clsx("text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      <button
        onClick={() => onChange(addMonths(value, 1))}
        disabled={isAtMax}
        className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-64 bg-white rounded-xl border border-gray-100 shadow-xl p-3">
          {/* Year header */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setGridYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header"
              aria-label="Previous year"
            >
              <ChevronLeft size={16} />
            </button>
            <span className=" font-semibold text-body text-header">{gridYear}</span>
            <button
              onClick={() => setGridYear((y) => y + 1)}
              disabled={maxMonthStart ? gridYear >= maxMonthStart.getFullYear() : false}
              className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next year"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1">
            {MONTH_LABELS.map((label, i) => {
              const monthStart = new Date(gridYear, i, 1);
              const disabled = maxMonthStart ? monthStart > maxMonthStart : false;
              const selected = value.getFullYear() === gridYear && value.getMonth() === i;
              const isNow = now.getFullYear() === gridYear && now.getMonth() === i;
              return (
                <button
                  key={label}
                  onClick={() => pick(i)}
                  disabled={disabled}
                  className={clsx(
                    "py-2 rounded-lg text-caption font-medium transition-colors",
                    selected
                      ? "bg-gold text-white"
                      : disabled
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-600 hover:bg-cream-dark",
                    !selected && isNow && "ring-1 ring-inset ring-gold/50",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Current-month shortcut */}
          <button
            onClick={() => { onChange(currentMonthStart); setOpen(false); }}
            disabled={isCurrentSelected}
            className="w-full mt-2 pt-2 border-t border-gray-100 text-caption font-medium text-gold hover:text-gold-dark transition-colors disabled:text-gray-300 disabled:cursor-default"
          >
            Current month
          </button>
        </div>
      )}
    </div>
  );
}
