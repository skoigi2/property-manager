"use client";
import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wrench, ListChecks } from "lucide-react";
import { readError, type InspectionDto } from "./types";

const JOB_STATUS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", AWAITING_PARTS: "Awaiting parts", DONE: "Done", CANCELLED: "Cancelled",
};

/**
 * Items in fair or poor condition on a handed-in inspection: a manager turns
 * them into maintenance jobs (one per item) and can start the unit's
 * "ready to re-let" checklist. Caretakers see the jobs read-only.
 */
export function RepairJobsPanel({ inspection, onChanged }: { inspection: InspectionDto; onChanged: (next: InspectionDto) => void }) {
  const r = inspection;
  const isManager = r.viewer.isManager;
  const worn = r.items.filter((i) => i.status === "POOR" || i.status === "FAIR");
  const jobById = new Map(r.repairJobs.map((j) => [j.id, j]));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(worn.filter((i) => i.status === "POOR" && !i.jobId).map((i) => i.id)));
  const [busy, setBusy] = useState<"jobs" | "turnover" | null>(null);

  if (worn.length === 0 && r.reportType !== "MOVE_OUT") return null;

  async function createJobs() {
    setBusy("jobs");
    try {
      const res = await fetch(`/api/condition-reports/${r.id}/repair-jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: Array.from(picked) }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't create the jobs")); return; }
      toast.success(`${picked.size} repair job${picked.size === 1 ? "" : "s"} created`);
      setPicked(new Set());
      onChanged(await res.json());
    } finally {
      setBusy(null);
    }
  }

  async function startTurnover() {
    setBusy("turnover");
    try {
      const res = await fetch(`/api/turnovers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId: r.unit.id, conditionReportId: r.id }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't start the checklist")); return; }
      toast.success("Re-let checklist started");
      const fresh = await fetch(`/api/condition-reports/${r.id}`);
      if (fresh.ok) onChanged(await fresh.json());
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-body font-medium text-gray-700 flex items-center gap-1.5"><Wrench size={14} /> Repairs</p>
        {r.reportType === "MOVE_OUT" && (
          r.openTurnover ? (
            <Link href="/inspections?view=relet" className="text-caption text-gold-dark flex items-center gap-1"><ListChecks size={13} /> Re-let checklist</Link>
          ) : isManager ? (
            <Button size="sm" variant="ghost" onClick={startTurnover} loading={busy === "turnover"}><ListChecks size={14} /> Start re-let checklist</Button>
          ) : null
        )}
      </div>
      {worn.length === 0 ? (
        <p className="text-body text-gray-400">No damage recorded.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {worn.map((i) => {
            const job = i.jobId ? jobById.get(i.jobId) : undefined;
            return (
              <label key={i.id} className="flex items-start gap-2 py-2">
                {isManager && !i.jobId && (
                  <input type="checkbox" className="mt-1" checked={picked.has(i.id)}
                    onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                )}
                <span className="flex-1 min-w-0">
                  <span className="text-body text-header">{i.room} — {i.feature}</span>
                  <span className={`ml-2 text-caption ${i.status === "POOR" ? "text-expense" : "text-amber-700"}`}>{i.status}</span>
                  {i.notes && <span className="block text-caption text-gray-500">{i.notes}</span>}
                </span>
                {job ? (
                  <Link href={`/maintenance?focus=${job.id}`} className="text-caption text-gold-dark whitespace-nowrap text-right">
                    Job: {JOB_STATUS[job.status] ?? job.status}
                    {job.quotes.length > 0 && (
                      <span className="block text-gray-500">
                        {job.quotes.some((q) => q.status === "ACCEPTED")
                          ? "Quote accepted"
                          : `${job.quotes.filter((q) => q.status === "RECEIVED").length} of ${job.quotes.length} quotes in`}
                      </span>
                    )}
                  </Link>
                ) : i.jobId ? (
                  <span className="text-caption text-gray-400 whitespace-nowrap">Job removed</span>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
      {isManager && picked.size > 0 && (
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={createJobs} loading={busy === "jobs"}>
            <Wrench size={14} /> Create {picked.size} repair job{picked.size === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </Card>
  );
}
