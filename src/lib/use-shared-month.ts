"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const KEY = "gw:selectedMonth";

function currentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Month picker state shared across pages (Dashboard / Income / Expenses) via
 * sessionStorage, so navigating between them keeps the month you were working
 * in instead of resetting to the current month.
 *
 * Hydration-safe: first render always shows the current month (matching SSR),
 * then a mount effect restores the stored month if one exists.
 */
export function useSharedMonth(): [Date, (d: Date) => void] {
  const [month, setMonthState] = useState<Date>(currentMonth);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const stored = sessionStorage.getItem(KEY);
      if (stored && /^\d{4}-\d{1,2}$/.test(stored)) {
        const [y, m] = stored.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        if (!isNaN(d.getTime())) setMonthState(d);
      }
    } catch { /* sessionStorage unavailable — keep current month */ }
  }, []);

  const setMonth = useCallback((d: Date) => {
    setMonthState(d);
    try { sessionStorage.setItem(KEY, `${d.getFullYear()}-${d.getMonth() + 1}`); } catch { /* ignore */ }
  }, []);

  return [month, setMonth];
}
