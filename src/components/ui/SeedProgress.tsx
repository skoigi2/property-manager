"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// The demo seed is one long POST with no streaming, so we show a friendly,
// time-based progress estimate that advances through realistic stages and eases
// toward (but never reaches) 100% until the request actually resolves.

const SEED_STAGES: { upTo: number; label: string }[] = [
  { upTo: 18,  label: "Creating property & units…" },
  { upTo: 40,  label: "Adding tenants & leases…" },
  { upTo: 62,  label: "Generating income, invoices & expenses…" },
  { upTo: 82,  label: "Setting up vendors, maintenance & cases…" },
  { upTo: 101, label: "Finalising…" },
];

export function SeedProgress() {
  const [pct, setPct] = useState(6);
  useEffect(() => {
    const id = setInterval(() => {
      // Decelerating ease: big steps early, tiny steps near the 92% cap.
      setPct((p) => (p >= 92 ? 92 : p + Math.max(1, Math.round((96 - p) / 14))));
    }, 650);
    return () => clearInterval(id);
  }, []);
  const stage = SEED_STAGES.find((s) => pct < s.upTo) ?? SEED_STAGES[SEED_STAGES.length - 1];
  return (
    <div className="mt-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-sans text-gray-500 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin text-gold" /> {stage.label}
        </span>
        <span className="text-xs font-mono text-gray-400">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-2 bg-gold rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 font-sans mt-2 text-center">
        This usually takes 20–30 seconds. Please keep this window open.
      </p>
    </div>
  );
}
