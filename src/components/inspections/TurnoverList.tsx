"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListChecks, CheckCircle2 } from "lucide-react";
import { readError } from "./types";

interface TurnoverDto {
  id: string;
  unit: { id: string; unitNumber: string; status: string };
  property: { id: string; name: string };
  tenantName: string | null;
  conditionReportId: string | null;
  startedAt: string;
  completedAt: string | null;
  completedByName: string | null;
  items: { key: string; label: string; done: boolean; doneAt: string | null; doneByName: string | null }[];
  progress: { done: number; total: number; complete: boolean };
  repairs: { total: number; open: number; unraised?: number };
  depositSettled: boolean;
  jobs: { id: string; title: string; status: string }[];
}

/** "Ready to re-let" checklists — managers and caretakers tick items on site. */
export function TurnoverList({ propertyId, isManager = false }: { propertyId: string | null; isManager?: boolean }) {
  const [view, setView] = useState<"open" | "done">("open");
  const [rows, setRows] = useState<TurnoverDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ view });
      if (propertyId) qs.set("propertyId", propertyId);
      const res = await fetch(`/api/turnovers?${qs}`);
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      toast.error("Couldn't load the checklists");
    } finally {
      setLoading(false);
    }
  }, [view, propertyId]);
  useEffect(() => { load(); }, [load]);

  async function patch(t: TurnoverDto, body: object, busyKey: string) {
    setBusy(busyKey);
    try {
      const res = await fetch(`/api/turnovers/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error(await readError(res, "Couldn't save")); return; }
      const next: TurnoverDto = await res.json();
      if (next.completedAt && view === "open") {
        toast.success(`Unit ${t.unit.unitNumber} is ready to re-let`);
        setRows((prev) => prev.filter((r) => r.id !== t.id));
      } else {
        setRows((prev) => prev.map((r) => (r.id === t.id ? next : r)));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
        {(["open", "done"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 text-caption font-medium transition-colors ${view === v ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
            {v === "open" ? "In progress" : "Ready"}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ListChecks size={40} />}
          title={view === "open" ? "No units being got ready" : "No finished checklists yet"}
          description="A checklist starts when a manager finalises a tenant's checkout." />
      ) : (
        rows.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body font-medium text-header">Unit {t.unit.unitNumber} · {t.property.name}</p>
                <p className="text-caption text-gray-400">
                  {t.tenantName ? `${t.tenantName} moved out · ` : ""}started {format(new Date(t.startedAt), "d MMM yyyy")}
                  {t.completedAt ? ` · ready ${format(new Date(t.completedAt), "d MMM yyyy")}${t.completedByName ? ` (${t.completedByName})` : ""}` : ""}
                </p>
              </div>
              <Badge variant={t.progress.complete ? "green" : "amber"}>{t.progress.done}/{t.progress.total}</Badge>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gold transition-all" style={{ width: `${(t.progress.done / t.progress.total) * 100}%` }} />
            </div>
            <div className="mt-3 space-y-1.5">
              {t.items.map((i) => {
                const auto = (i.key === "repairs" && (t.repairs.open > 0 || (t.repairs.total > 0 && !t.repairs.unraised))) || (i.key === "deposit" && t.depositSettled);
                const managerOnly = i.key === "repairs" && !i.done && !!t.repairs.unraised && !isManager;
                const locked = !!t.completedAt || auto || managerOnly || busy === `${t.id}:${i.key}`;
                return (
                  <label key={i.key} className={`flex items-start gap-2 text-body ${i.done ? "text-gray-500" : "text-gray-800"}`}>
                    <input type="checkbox" className="mt-1" checked={i.done} disabled={locked}
                      onChange={(e) => patch(t, { key: i.key, done: e.target.checked }, `${t.id}:${i.key}`)} />
                    <span className="flex-1 min-w-0">
                      <span className={i.done ? "line-through" : ""}>{i.label}</span>
                      {i.key === "repairs" && !!t.repairs.unraised && (
                        <span className="ml-2 text-caption text-amber-700">{t.repairs.unraised} damaged item{t.repairs.unraised === 1 ? "" : "s"} without a repair job</span>
                      )}
                      {i.key === "repairs" && t.repairs.total > 0 && (
                        <span className="ml-2 text-caption text-gray-500">{t.repairs.total - t.repairs.open} of {t.repairs.total} jobs done</span>
                      )}
                      {i.key === "deposit" && t.depositSettled && <span className="ml-2 text-caption text-gray-500">settled at checkout</span>}
                      {i.done && i.doneByName && !auto && (
                        <span className="block text-caption text-gray-400">{i.doneByName}{i.doneAt ? `, ${format(new Date(i.doneAt), "d MMM")}` : ""}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {t.jobs.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-100 space-y-0.5">
                {t.jobs.map((j) => (
                  <Link key={j.id} href={`/maintenance?focus=${j.id}`} className="flex items-center justify-between text-caption text-gray-600 hover:text-gold-dark">
                    <span className="truncate">{j.title}</span>
                    <span className={j.status === "DONE" || j.status === "CANCELLED" ? "text-green-700" : "text-amber-700"}>{j.status.replace("_", " ").toLowerCase()}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {t.conditionReportId && (
                <Link href={`/inspections/${t.conditionReportId}`} className="text-caption text-gold-dark">Move-out inspection</Link>
              )}
              {!t.completedAt && t.progress.complete && (
                <Button size="sm" onClick={() => patch(t, { complete: true }, `${t.id}:complete`)} loading={busy === `${t.id}:complete`}>
                  <CheckCircle2 size={14} /> Mark ready to re-let
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
