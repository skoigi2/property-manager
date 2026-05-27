"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Reads `?focus=<id>` from the URL and scrolls to the element with
 * id `item-<id>`, briefly highlighting it. Polls for up to ~4.5s so
 * it works on pages that load data asynchronously after mount.
 *
 * Each list page should call this hook once and ensure its row root
 * carries `id={`item-${row.id}`}`.
 */
export function useFocusScroll() {
  const params = useSearchParams();
  const focusId = params.get("focus");

  useEffect(() => {
    if (!focusId) return;
    let attempts = 0;
    let cancelled = false;
    const target = `item-${focusId}`;
    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-gold", "ring-offset-2", "rounded-xl");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-gold", "ring-offset-2");
        }, 2500);
        return;
      }
      if (++attempts < 30) setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [focusId]);
}
