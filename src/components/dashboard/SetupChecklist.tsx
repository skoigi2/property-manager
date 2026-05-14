"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { HelpTip } from "@/components/ui/HelpTip";
import type { SetupProgress } from "@/lib/setup-progress";

interface Props {
  propertyId: string;
}

export function SetupChecklist({ propertyId }: Props) {
  const [data, setData] = useState<SetupProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/setup-progress?propertyId=${propertyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  useEffect(() => {
    if (!data) return;
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(`setup-dismissed:${data.propertyId}`)
      : null;
    setDismissed(stored === "1" && data.percent === 100);
    setOpen(data.percent < 100);
    const t = setTimeout(() => setAnimatedPercent(data.percent), 60);
    return () => clearTimeout(t);
  }, [data]);

  if (loading || !data) return null;
  if (dismissed) return null;

  const { percent, completedCount, totalCount, items, propertyName } = data;
  const isComplete = percent === 100;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`setup-dismissed:${data.propertyId}`, "1");
    }
    setDismissed(true);
  };

  const headline = isComplete
    ? `${propertyName} is fully configured`
    : `${propertyName} is ${percent}% configured`;

  const cheer =
    percent >= 80 && !isComplete
      ? "Almost there — finish strong."
      : percent >= 50 && !isComplete
      ? "Great momentum — keep going."
      : !isComplete
      ? "Let's get the basics in place."
      : "Everything looks ready.";

  return (
    <Card className="border border-gold/30 bg-gradient-to-br from-cream/40 to-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-gold" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-header text-lg leading-tight truncate">{headline}</h2>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              {completedCount} of {totalCount} steps done · {cheer}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors"
            title={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {isComplete && (
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
        <div
          className={`h-full ${isComplete ? "bg-green-500" : "bg-gold"} transition-[width] duration-700 ease-out`}
          style={{ width: `${animatedPercent}%` }}
        />
      </div>

      {open && (
        <ul className="space-y-2">
          {items
            .filter((i) => i.applicable)
            .map((item) => (
              <li
                key={item.key}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${
                  item.done ? "bg-green-50/40" : "bg-amber-50/40"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.done ? (
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-sans truncate ${
                      item.done ? "text-gray-400 line-through" : "text-header"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.hint && !item.done && (
                    <HelpTip text={item.hint} position="below" />
                  )}
                </div>
                {!item.done && (
                  <Link
                    href={item.ctaHref}
                    className="text-xs font-sans font-medium text-gold hover:text-gold-dark whitespace-nowrap shrink-0"
                  >
                    {item.ctaLabel} →
                  </Link>
                )}
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
