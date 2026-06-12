"use client";

import { useEffect, useState } from "react";
import { X, Clock, PlusCircle, Pencil, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

interface AuditEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  userEmail: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_META = {
  CREATE: { label: "Created", icon: PlusCircle, cls: "bg-green-50 text-income" },
  UPDATE: { label: "Updated", icon: Pencil, cls: "bg-amber-50 text-amber-700" },
  DELETE: { label: "Deleted", icon: Trash2, cls: "bg-red-50 text-expense" },
} as const;

/** Keys that change on every write and add no information in a diff view. */
const NOISE_KEYS = new Set(["updatedAt", "createdAt", "id"]);

function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of keys) {
    if (NOISE_KEYS.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ key, from, to });
  }
  return changes;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Right-hand slide-over showing the audit trail for a single record.
 * Data: GET /api/audit-logs?resource=&resourceId= (org-scoped, manager+).
 */
export function HistoryDrawer({
  resource,
  resourceId,
  title,
  onClose,
}: {
  resource: string;
  resourceId: string;
  title?: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    fetch(`/api/audit-logs?resource=${encodeURIComponent(resource)}&resourceId=${encodeURIComponent(resourceId)}&limit=50`)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setEntries(d.logs ?? []))
      .catch(() => setEntries([]));
  }, [resource, resourceId]);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gold" />
            <h2 className="font-display text-base text-header">{title ?? "Change history"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {entries === null ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 font-sans text-center py-16">
              No recorded changes for this record.
            </p>
          ) : (
            entries.map((e) => {
              const meta = ACTION_META[e.action] ?? ACTION_META.UPDATE;
              const Icon = meta.icon;
              const changes = e.action === "UPDATE" ? changedFields(e.before, e.after) : [];
              return (
                <div key={e.id} className="border border-gray-100 rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-sans font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>
                      <Icon size={11} /> {meta.label}
                    </span>
                    <span className="text-[11px] text-gray-400 font-sans">
                      {new Date(e.createdAt).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-sans mt-1.5">{e.userEmail ?? "system"}</p>
                  {changes.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-gray-50 pt-2.5">
                      {changes.map((c) => (
                        <div key={c.key} className="text-xs font-sans">
                          <span className="text-gray-400">{c.key}: </span>
                          <span className="text-expense line-through break-all">{fmtValue(c.from)}</span>
                          <span className="text-gray-300 mx-1.5">→</span>
                          <span className="text-income break-all">{fmtValue(c.to)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
