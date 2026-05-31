import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeWithTooltip } from "@/lib/relative-time";

export type CaseStatus =
  | "OPEN" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "AWAITING_VENDOR" | "AWAITING_TENANT" | "RESOLVED" | "CLOSED";
export type CaseWaitingOn = "MANAGER" | "OWNER" | "TENANT" | "VENDOR" | "NONE";
export type CaseType = "MAINTENANCE" | "LEASE_RENEWAL" | "ARREARS" | "COMPLIANCE" | "GENERAL";

export interface CaseRow {
  id: string;
  caseType: CaseType;
  title: string;
  status: CaseStatus;
  waitingOn: CaseWaitingOn;
  stage: string | null;
  currentStageIndex: number;
  lastActivityAt: string;
  createdAt: string;
  slaDueAt: string | null;
  property: { id: string; name: string };
  unit: { id: string; unitNumber: string } | null;
  owner: { id: string; name: string | null; email: string | null } | null;
  vendor: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null; email: string | null } | null;
}

export const WAITING_DOT: Record<CaseWaitingOn, string> = {
  MANAGER: "bg-gray-400",
  OWNER:   "bg-blue-500",
  TENANT:  "bg-amber-500",
  VENDOR:  "bg-purple-500",
  NONE:    "bg-gray-200",
};

export const WAITING_LABEL: Record<CaseWaitingOn, string> = {
  MANAGER: "Manager", OWNER: "Owner", TENANT: "Tenant", VENDOR: "Vendor", NONE: "—",
};

export const STATUS_BADGE: Record<CaseStatus, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red",
  IN_PROGRESS: "amber",
  AWAITING_APPROVAL: "gold",
  AWAITING_VENDOR: "blue",
  AWAITING_TENANT: "blue",
  RESOLVED: "green",
  CLOSED: "gray",
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_APPROVAL: "Awaiting approval",
  AWAITING_VENDOR: "Awaiting vendor",
  AWAITING_TENANT: "Awaiting tenant",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

// Ordered status columns for the Kanban view
export const STATUS_ORDER: CaseStatus[] = [
  "OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VENDOR", "AWAITING_TENANT", "RESOLVED", "CLOSED",
];

export const WORKFLOW_LENGTHS: Record<CaseType, number> = {
  MAINTENANCE:   11,
  LEASE_RENEWAL: 8,
  ARREARS:       6,
  COMPLIANCE:    6,
  GENERAL:       4,
};

export function ProgressChip({ c }: { c: CaseRow }) {
  const total = WORKFLOW_LENGTHS[c.caseType] ?? 1;
  const cur = Math.min(Math.max(c.currentStageIndex + 1, 1), total);
  const pct = Math.round((cur / total) * 100);
  const isTerminal = c.status === "RESOLVED" || c.status === "CLOSED";
  return (
    <div className="flex items-center gap-2 min-w-[8rem]">
      <span className={`inline-block w-2 h-2 rounded-full ${WAITING_DOT[c.waitingOn]}`} title={`Waiting: ${c.waitingOn}`} />
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 ${isTerminal ? "bg-green-500" : "bg-gold"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-500 shrink-0">{cur}/{total}</span>
    </div>
  );
}

/** Compact, clickable case card used by Kanban / Calendar / grouped views. */
export function CaseCard({ c, showProperty = true }: { c: CaseRow; showProperty?: boolean }) {
  const t = formatRelativeWithTooltip(c.lastActivityAt);
  return (
    <Link
      href={`/cases/${c.id}`}
      className="block rounded-lg border border-gray-100 bg-white p-3 hover:border-gold/40 hover:shadow-sm transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-sans font-medium text-sm text-gray-900 leading-snug line-clamp-2">{c.title}</p>
        <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      </div>
      {showProperty && (
        <p className="text-xs text-gray-500 font-sans mb-2 truncate">
          {c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}
        </p>
      )}
      <ProgressChip c={c} />
      <div className="flex items-center justify-between mt-2 text-xs font-sans">
        <span className="text-gray-500">Waiting: {WAITING_LABEL[c.waitingOn]}</span>
        <span className="text-gray-400" title={t.full}>{t.short}</span>
      </div>
    </Link>
  );
}
