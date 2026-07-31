"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CaseRow, CaseCard } from "./shared";

interface Group {
  key: string;
  label: string;
  cases: CaseRow[];
}

/**
 * Generic collapsible grouped view. `keyOf` returns the group key (with a
 * stable fallback for nulls); `labelOf` returns the display label.
 */
export function CaseGroupedView({
  rows,
  keyOf,
  labelOf,
  emptyKey,
}: {
  rows: CaseRow[];
  keyOf: (c: CaseRow) => string | null;
  labelOf: (c: CaseRow) => string;
  emptyKey: string; // label for the "no group" bucket, e.g. "No vendor"
}) {
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const c of rows) {
      const rawKey = keyOf(c);
      const key = rawKey ?? "__none__";
      const label = rawKey ? labelOf(c) : emptyKey;
      if (!map.has(key)) map.set(key, { key, label, cases: [] });
      map.get(key)!.cases.push(c);
    }
    // Sort by case count desc, but always push the "none" bucket last.
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return b.cases.length - a.cases.length;
    });
  }, [rows, keyOf, labelOf, emptyKey]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key];
        return (
          <div key={g.key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggle(g.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium text-body text-gray-900">
                {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                {g.label}
              </span>
              <span className="text-caption font-mono text-gray-400">{g.cases.length}</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3 pt-0">
                {g.cases.map((c) => <CaseCard key={c.id} c={c} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
