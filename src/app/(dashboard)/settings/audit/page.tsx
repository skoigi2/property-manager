"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/date-utils";
import { ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

interface AuditLog {
  id: string;
  userId: string;
  userEmail: string | null;
  action: "CREATE" | "UPDATE" | "DELETE";
  resource: string;
  resourceId: string;
  before: object | null;
  after: object | null;
  createdAt: string;
}

const ACTION_BADGE: Record<string, "green"|"amber"|"red"> = {
  CREATE: "green",
  UPDATE: "amber",
  DELETE: "red",
};

const RESOURCE_LABELS: Record<string, string> = {
  IncomeEntry:  "Income",
  ExpenseEntry: "Expense",
  PettyCash:    "Petty Cash",
  Invoice:      "Invoice",
};

const RESOURCES = ["", "IncomeEntry", "ExpenseEntry", "PettyCash", "Invoice"];
const PAGE_SIZE = 50;

export default function AuditPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState("");
  const [page, setPage]       = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (resource) params.set("resource", resource);
    fetch(`/api/audit-logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [resource, page]);

  useEffect(() => { setPage(0); }, [resource]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <Header title="Audit Log" />
      <div className="page-container space-y-5">
        <Card padding="sm" className="bg-blue-50/50 border border-blue-100">
          <p className="text-xs text-blue-700 font-sans">
            <strong>Audit Trail</strong> — every financial create, update, and delete is recorded here with the acting user and a before/after snapshot.
          </p>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={resource} onChange={e => setResource(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30">
            {RESOURCES.map(r => (
              <option key={r} value={r}>{r ? (RESOURCE_LABELS[r] ?? r) : "All resources"}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 font-sans">{total.toLocaleString()} record{total !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={32} className="text-gray-300" />} title="No audit records yet" description="Financial actions will appear here once you start recording income, expenses, and invoices." />
        ) : (
          <div className="space-y-1.5">
            {logs.map(log => (
              <button key={log.id} onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="w-full text-left">
              <Card padding="sm" className="cursor-pointer hover:border-gray-200 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant={ACTION_BADGE[log.action]}>{log.action}</Badge>
                  <span className="text-sm font-medium text-header">{RESOURCE_LABELS[log.resource] ?? log.resource}</span>
                  <span className="text-xs text-gray-400 font-mono truncate">{log.resourceId}</span>
                  <span className="ml-auto text-xs text-gray-400 font-sans shrink-0">{log.userEmail ?? log.userId}</span>
                  <span className="text-xs text-gray-400 font-sans shrink-0">{formatDate(new Date(log.createdAt))}</span>
                </div>

                {/* Expanded diff */}
                {expanded === log.id && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {log.before && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Before</p>
                        <pre className={clsx("text-xs font-mono bg-red-50 border border-red-100 rounded p-2 overflow-auto max-h-32")}>
                          {JSON.stringify(log.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.after && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">After</p>
                        <pre className={clsx("text-xs font-mono bg-green-50 border border-green-100 rounded p-2 overflow-auto max-h-32")}>
                          {JSON.stringify(log.after, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
              </button>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-3">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-sans text-gray-500">Page {page + 1} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
