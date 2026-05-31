"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Header } from "@/components/layout/Header";
import { useProperty } from "@/lib/property-context";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Inbox, List, Columns3, CalendarDays, Building2, UserRound, Wrench } from "lucide-react";
import type { CaseRow } from "@/components/cases/shared";
import { CaseListView } from "@/components/cases/CaseListView";
import { CaseKanbanView } from "@/components/cases/CaseKanbanView";
import { CaseCalendarView } from "@/components/cases/CaseCalendarView";
import { CaseGroupedView } from "@/components/cases/CaseGroupedView";

type View = "list" | "kanban" | "calendar" | "property" | "owner" | "vendor";

const VIEWS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "list",     label: "List",     icon: List },
  { id: "kanban",   label: "Kanban",   icon: Columns3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "property", label: "Property", icon: Building2 },
  { id: "owner",    label: "Owner",    icon: UserRound },
  { id: "vendor",   label: "Vendor",   icon: Wrench },
];

export default function CasesPage() {
  const { selectedId } = useProperty();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [waitingOn, setWaitingOn] = useState<string>("");
  const [caseType, setCaseType] = useState<string>("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [view, setView] = useState<View>("list");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedId) params.set("propertyId", selectedId);
    if (status) params.set("status", status);
    if (waitingOn) params.set("waitingOn", waitingOn);
    if (caseType) params.set("caseType", caseType);
    if (assignedToMe) params.set("assignedToMe", "true");
    setCases(null);
    fetch(`/api/cases?${params.toString()}`)
      .then((r) => r.json())
      .then(setCases)
      .catch(() => setCases([]));
  }, [selectedId, status, waitingOn, caseType, assignedToMe]);

  // Read caseType + view from query string once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("caseType");
    if (t) setCaseType(t);
    const v = sp.get("view") as View | null;
    if (v && VIEWS.some((x) => x.id === v)) setView(v);
  }, []);

  function changeView(v: View) {
    setView(v);
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      sp.set("view", v);
      window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
    }
  }

  const rows = cases ?? [];

  return (
    <>
      <Header title="Cases" />
      <div className="page-container space-y-4">
        {/* View switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto max-w-full">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => changeView(v.id)}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium font-sans transition-all whitespace-nowrap",
                  view === v.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                )}
              >
                <Icon size={15} />
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
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
        ) : view === "list" ? (
          <CaseListView rows={rows} />
        ) : view === "kanban" ? (
          <CaseKanbanView rows={rows} />
        ) : view === "calendar" ? (
          <CaseCalendarView rows={rows} />
        ) : view === "property" ? (
          <CaseGroupedView
            rows={rows}
            keyOf={(c) => c.property.id}
            labelOf={(c) => c.property.name}
            emptyKey="No property"
          />
        ) : view === "owner" ? (
          <CaseGroupedView
            rows={rows}
            keyOf={(c) => c.owner?.id ?? null}
            labelOf={(c) => c.owner?.name ?? c.owner?.email ?? "Owner"}
            emptyKey="Unassigned owner"
          />
        ) : (
          <CaseGroupedView
            rows={rows}
            keyOf={(c) => c.vendor?.id ?? null}
            labelOf={(c) => c.vendor?.name ?? "Vendor"}
            emptyKey="No vendor"
          />
        )}
      </div>
    </>
  );
}
