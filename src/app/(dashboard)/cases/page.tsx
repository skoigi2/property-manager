"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Inbox } from "lucide-react";
import { formatRelativeWithTooltip } from "@/lib/relative-time";

type CaseStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "AWAITING_VENDOR" | "AWAITING_TENANT" | "RESOLVED" | "CLOSED";
type CaseWaitingOn = "MANAGER" | "OWNER" | "TENANT" | "VENDOR" | "NONE";
type CaseType = "MAINTENANCE" | "LEASE_RENEWAL" | "ARREARS" | "COMPLIANCE" | "GENERAL";

interface CaseRow {
  id: string;
  caseType: CaseType;
  title: string;
  status: CaseStatus;
  waitingOn: CaseWaitingOn;
  stage: string | null;
  lastActivityAt: string;
  property: { id: string; name: string };
  unit: { id: string; unitNumber: string } | null;
  assignedTo: { id: string; name: string | null; email: string | null } | null;
}

const STATUS_BADGE: Record<CaseStatus, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red",
  IN_PROGRESS: "amber",
  AWAITING_APPROVAL: "gold",
  AWAITING_VENDOR: "blue",
  AWAITING_TENANT: "blue",
  RESOLVED: "green",
  CLOSED: "gray",
};

const WAITING_LABEL: Record<CaseWaitingOn, string> = {
  MANAGER: "Manager", OWNER: "Owner", TENANT: "Tenant", VENDOR: "Vendor", NONE: "—",
};

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [waitingOn, setWaitingOn] = useState<string>("");
  const [caseType, setCaseType] = useState<string>("");
  const [assignedToMe, setAssignedToMe] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (waitingOn) params.set("waitingOn", waitingOn);
    if (caseType) params.set("caseType", caseType);
    if (assignedToMe) params.set("assignedToMe", "true");
    setCases(null);
    fetch(`/api/cases?${params.toString()}`)
      .then((r) => r.json())
      .then(setCases)
      .catch(() => setCases([]));
  }, [status, waitingOn, caseType, assignedToMe]);

  // Read caseType from query string once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("caseType");
    if (t) setCaseType(t);
  }, []);

  const rows = cases ?? [];

  return (
    <>
      <Header title="Cases" />
      <div className="page-container space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All" },
              { value: "OPEN", label: "Open" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "AWAITING_APPROVAL", label: "Awaiting approval" },
              { value: "AWAITING_VENDOR", label: "Awaiting vendor" },
              { value: "AWAITING_TENANT", label: "Awaiting tenant" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "CLOSED", label: "Closed" },
            ]}
          />
          <Select
            label="Waiting on"
            value={waitingOn}
            onChange={(e) => setWaitingOn(e.target.value)}
            options={[
              { value: "", label: "All" },
              { value: "MANAGER", label: "Manager" },
              { value: "OWNER", label: "Owner" },
              { value: "TENANT", label: "Tenant" },
              { value: "VENDOR", label: "Vendor" },
              { value: "NONE", label: "Nobody" },
            ]}
          />
          <Select
            label="Type"
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            options={[
              { value: "", label: "All" },
              { value: "MAINTENANCE", label: "Maintenance" },
              { value: "LEASE_RENEWAL", label: "Lease renewal" },
              { value: "ARREARS", label: "Arrears" },
              { value: "COMPLIANCE", label: "Compliance" },
              { value: "GENERAL", label: "General" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm font-sans h-10 px-3 rounded-lg bg-gray-50 border border-gray-200">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={(e) => setAssignedToMe(e.target.checked)}
            />
            Assigned to me
          </label>
        </div>

        {cases === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={36} />}
            title="No cases yet"
            description="Cases are created automatically when a maintenance job is logged."
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
              {rows.map((c) => {
                const t = formatRelativeWithTooltip(c.lastActivityAt);
                return (
                  <Link key={c.id} href={`/cases/${c.id}`} className="block p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-sans font-medium text-sm truncate">{c.title}</p>
                      <Badge variant={STATUS_BADGE[c.status]}>{c.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 font-sans">
                      {c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-xs font-sans">
                      <span className="text-gray-500">Waiting: {WAITING_LABEL[c.waitingOn]}</span>
                      <span className="text-gray-400" title={t.full}>{t.short}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100">
              <table className="min-w-[800px] w-full text-sm font-sans">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Title</th>
                    <th className="px-4 py-2">Property / unit</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Waiting on</th>
                    <th className="px-4 py-2">Assigned</th>
                    <th className="px-4 py-2">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((c) => {
                    const t = formatRelativeWithTooltip(c.lastActivityAt);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-2">
                          <Link href={`/cases/${c.id}`} className="text-gray-900 hover:text-gold">{c.title}</Link>
                          {c.caseType !== "MAINTENANCE" && (
                            <span className="ml-2 text-[10px] uppercase text-gray-400">{c.caseType}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}
                        </td>
                        <td className="px-4 py-2"><Badge variant={STATUS_BADGE[c.status]}>{c.status.replace(/_/g, " ")}</Badge></td>
                        <td className="px-4 py-2 text-gray-600">{WAITING_LABEL[c.waitingOn]}</td>
                        <td className="px-4 py-2 text-gray-600">{c.assignedTo?.name ?? c.assignedTo?.email ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-400" title={t.full}>{t.short}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
