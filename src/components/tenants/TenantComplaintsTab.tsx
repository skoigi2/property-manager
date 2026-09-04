"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { formatRelativeWithTooltip } from "@/lib/relative-time";
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from "@/lib/complaint-rules";
import { MessageSquareWarning } from "lucide-react";

type Row = {
  id: string;
  title: string;
  category: ComplaintCategory;
  source: "STAFF" | "PORTAL";
  raisedByName: string;
  subjectUnit: { unitNumber: string } | null;
  createdAt: string;
  resolvedAt: string | null;
  caseThread: { status: string; stage: string | null; lastActivityAt: string; slaDueAt: string | null } | null;
};

const STATUS_BADGE: Record<string, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red", IN_PROGRESS: "amber", AWAITING_APPROVAL: "gold", AWAITING_VENDOR: "blue", AWAITING_TENANT: "blue", RESOLVED: "green", CLOSED: "gray",
};

/** Manager-side view of everything a tenant has raised (and staff complaints linked to them). */
export function TenantComplaintsTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(`/api/complaints?tenantId=${tenantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, [tenantId]);

  if (!rows) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <MessageSquareWarning size={28} className="mx-auto mb-2 text-gray-300" />
        <p className="text-body">No complaints linked to this tenant.</p>
        <Link href="/complaints" className="text-caption text-gold hover:underline">Open the complaints queue →</Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const act = r.caseThread ? formatRelativeWithTooltip(r.caseThread.lastActivityAt) : null;
        const overdue = !!r.caseThread?.slaDueAt && !["RESOLVED", "CLOSED"].includes(r.caseThread.status) && new Date(r.caseThread.slaDueAt).getTime() < Date.now();
        return (
          <Link key={r.id} href={`/complaints/${r.id}`} className="block bg-white rounded-xl border border-gray-100 hover:border-gold/40 transition-colors px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-body font-medium text-header truncate">{r.title}</p>
              {r.caseThread && <Badge variant={STATUS_BADGE[r.caseThread.status] ?? "gray"}>{r.caseThread.stage ?? r.caseThread.status}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-caption text-gray-400">
              <span>{COMPLAINT_CATEGORY_LABEL[r.category] ?? r.category}</span>
              <span>·</span>
              <span>{r.source === "PORTAL" ? "Raised in the portal" : `Logged by ${r.raisedByName}`}</span>
              {r.subjectUnit && <><span>·</span><span>about {r.subjectUnit.unitNumber}</span></>}
              {overdue && <Badge variant="red">Past SLA</Badge>}
              {act && <span className="ml-auto" title={act.full}>{act.short}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
