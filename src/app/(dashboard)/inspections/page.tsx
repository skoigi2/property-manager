"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProperty } from "@/lib/property-context";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { INSPECTION_TYPE_LABEL, INSPECTION_STATUS_LABEL, type InspectionType, type InspectionStatus } from "@/lib/inspection-rules";
import { ClipboardCheck, Plus, KeyRound, CalendarClock, User } from "lucide-react";
import { TurnoverList } from "@/components/inspections/TurnoverList";
import { TutorialVideo } from "@/components/ui/TutorialVideo";

interface InspectionRow {
  id: string;
  reportType: InspectionType;
  status: InspectionStatus;
  scheduledFor: string | null;
  createdAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  editRequestedAt: string | null;
  sentToTenantAt: string | null;
  keysWaiting: boolean;
  unit: { id: string; unitNumber: string };
  property: { id: string; name: string };
  tenant: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null } | null;
}

interface PropertyOption { id: string; name: string; units?: { id: string; unitNumber: string }[] }
interface TenantOption { id: string; name: string; isActive: boolean; unit: { id: string; unitNumber: string; propertyId: string } }
interface Assignee { id: string; name: string; role: string | null }

type View = "open" | "review" | "done" | "relet";
const VIEWS: { key: View; label: string }[] = [
  { key: "open", label: "To do" },
  { key: "review", label: "Awaiting review" },
  { key: "done", label: "Accepted" },
  { key: "relet", label: "Re-let" },
];

const STATUS_BADGE: Record<InspectionStatus, "gray" | "blue" | "amber" | "green"> = {
  SCHEDULED: "gray", IN_PROGRESS: "blue", SUBMITTED: "amber", ACCEPTED: "green",
};

function whenLabel(r: InspectionRow): { text: string; overdue: boolean } {
  if (r.status === "ACCEPTED" && r.acceptedAt) return { text: `Accepted ${format(new Date(r.acceptedAt), "d MMM yyyy")}`, overdue: false };
  if (r.status === "SUBMITTED" && r.submittedAt) return { text: `Handed in ${format(new Date(r.submittedAt), "d MMM, HH:mm")}`, overdue: false };
  if (!r.scheduledFor) return { text: "Not scheduled", overdue: false };
  const d = new Date(r.scheduledFor);
  return { text: format(d, "EEE d MMM, HH:mm"), overdue: d.getTime() < Date.now() };
}

export default function InspectionsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <InspectionsInner />
    </Suspense>
  );
}

function InspectionsInner() {
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const isManager = orgRole === "ADMIN" || orgRole === "MANAGER" || orgRole === "ACCOUNTANT";
  const { selectedId } = useProperty();
  const search = useSearchParams();
  const router = useRouter();

  const [view, setView] = useState<View>(() => {
    const v = search.get("view");
    return v === "review" || v === "done" || v === "relet" ? v : "open";
  });
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(search.get("new") === "1");

  const load = useCallback(async () => {
    if (view === "relet") return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ view });
      if (selectedId) qs.set("propertyId", selectedId);
      if (mine) qs.set("mine", "1");
      const res = await fetch(`/api/inspections?${qs}`);
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      toast.error("Couldn't load inspections");
    } finally {
      setLoading(false);
    }
  }, [view, selectedId, mine]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header title="Inspections" userName={session?.user?.name ?? session?.user?.email} role={orgRole}>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-1" /> New inspection
        </Button>
      </Header>

      <div className="page-container space-y-4 pb-24 lg:pb-8">
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={clsx("px-3 py-1.5 text-caption font-medium transition-colors", view === v.key ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50")}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className={view === "relet" ? "ml-auto" : ""}><TutorialVideo tutorialKey="caretaker-inspections" variant="link" /></span>
            {view !== "relet" && <label className="flex items-center gap-2 text-caption text-gray-600 ml-auto">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              Assigned to me
            </label>}
          </div>
        </Card>

        {view === "relet" ? (
          <TurnoverList propertyId={selectedId} isManager={isManager} />
        ) : loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck size={40} />}
            title={view === "open" ? "No inspections to do" : view === "review" ? "Nothing waiting for review" : "No accepted inspections yet"}
            description={view === "open" ? "Book a move-in, mid-term or move-out inspection with New inspection." : "Handed-in inspections appear here."}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => <InspectionCard key={r.id} r={r} isManager={isManager} />)}
          </div>
        )}
      </div>

      {showForm && (
        <NewInspectionModal
          isManager={isManager}
          myId={session?.user?.id ?? null}
          defaultPropertyId={selectedId}
          defaults={{ unitId: search.get("unitId"), tenantId: search.get("tenantId"), type: search.get("type") }}
          onClose={() => setShowForm(false)}
          onCreated={(id) => { setShowForm(false); router.push(`/inspections/${id}`); }}
        />
      )}
    </div>
  );
}

function InspectionCard({ r, isManager }: { r: InspectionRow; isManager: boolean }) {
  const when = whenLabel(r);
  return (
    <Link href={`/inspections/${r.id}`} className="block">
      <Card padding="sm" className="hover:border-gold/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-body font-medium text-header truncate">
              {INSPECTION_TYPE_LABEL[r.reportType]} inspection · Unit {r.unit.unitNumber}
            </p>
            <p className="text-caption text-gray-400 mt-0.5 truncate">
              {r.property.name}{r.tenant ? ` · ${r.tenant.name}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={STATUS_BADGE[r.status]}>{INSPECTION_STATUS_LABEL[r.status]}</Badge>
            {r.editRequestedAt && <Badge variant="red">Correction requested</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-caption">
          <span className={clsx("flex items-center gap-1", when.overdue && r.status !== "SUBMITTED" ? "text-expense font-medium" : "text-gray-500")}>
            <CalendarClock size={12} /> {when.text}
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <User size={12} /> {r.assignedTo?.name ?? "Unassigned"}
          </span>
          {r.keysWaiting && (
            <span className="flex items-center gap-1 text-amber-700">
              <KeyRound size={12} /> {isManager ? "Clear keys when deposit and rent are in" : "Keys waiting for the manager"}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewInspectionModal({ isManager, myId, defaultPropertyId, defaults, onClose, onCreated }: {
  isManager: boolean;
  myId: string | null;
  defaultPropertyId: string | null;
  defaults: { unitId: string | null; tenantId: string | null; type: string | null };
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: properties } = useCachedFetch<PropertyOption[]>("properties:full", "/api/properties");
  const props = useMemo(() => properties ?? [], [properties]);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [unitId, setUnitId] = useState(defaults.unitId ?? "");
  const [tenantId, setTenantId] = useState(defaults.tenantId ?? "");
  const [reportType, setReportType] = useState<InspectionType>(
    defaults.type === "MOVE_OUT" || defaults.type === "MID_TERM" ? defaults.type : "MOVE_IN",
  );
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return toLocalInput(d);
  });
  // undefined = not picked: the server assigns a caretaker's booking to themselves
  // and leaves a manager's unassigned (the session may still be loading here).
  const [assignee, setAssignee] = useState<string | undefined>(undefined);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A deep link names the unit: find its property.
  useEffect(() => {
    if (propertyId || !defaults.unitId) return;
    const p = props.find((x) => x.units?.some((u) => u.id === defaults.unitId));
    if (p) setPropertyId(p.id);
  }, [props, propertyId, defaults.unitId]);
  useEffect(() => { if (!propertyId && props.length === 1) setPropertyId(props[0].id); }, [props, propertyId]);

  useEffect(() => {
    if (!propertyId) { setTenants([]); setAssignees([]); return; }
    fetch(`/api/tenants?projection=directory&propertyId=${propertyId}`).then((r) => (r.ok ? r.json() : [])).then(setTenants).catch(() => setTenants([]));
    fetch(`/api/inspections/assignees?propertyId=${propertyId}`).then((r) => (r.ok ? r.json() : [])).then(setAssignees).catch(() => setAssignees([]));
  }, [propertyId]);

  const units = props.find((p) => p.id === propertyId)?.units ?? [];
  const unitTenants = tenants.filter((t) => t.unit?.id === unitId && t.isActive);
  useEffect(() => {
    if (unitTenants.length && !unitTenants.some((t) => t.id === tenantId)) setTenantId(unitTenants[0].id);
    if (!unitTenants.length && tenantId && !defaults.tenantId) setTenantId("");
  }, [unitTenants, tenantId, defaults.tenantId]);

  const needsTenant = reportType !== "MID_TERM";

  async function submit() {
    setErr(null);
    if (!unitId) { setErr("Pick a unit"); return; }
    if (needsTenant && !tenantId) { setErr("This unit has no tenant. Add the tenant first, or book a mid-term inspection."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          reportType,
          tenantId: tenantId || null,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          ...(assignee === undefined ? {} : { assignedToUserId: assignee || null }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(typeof body.error === "string" ? body.error : "Couldn't book the inspection"); return; }
      toast.success("Inspection booked");
      onCreated(body.id);
    } finally {
      setSaving(false);
    }
  }

  const assigneeOptions = isManager
    ? [{ value: "", label: "Unassigned" }, ...assignees.map((a) => ({ value: a.id, label: `${a.name}${a.role === "CARETAKER" ? " (caretaker)" : ""}` }))]
    : myId ? [{ value: myId, label: "Me" }, { value: "", label: "Unassigned" }] : [{ value: "", label: "Me" }];

  return (
    <Modal open onClose={onClose} title="New inspection">
      <div className="space-y-3">
        <Select
          label="Type"
          value={reportType}
          onChange={(e) => setReportType(e.target.value as InspectionType)}
          options={(["MOVE_IN", "MID_TERM", "MOVE_OUT"] as InspectionType[]).map((t) => ({ value: t, label: `${INSPECTION_TYPE_LABEL[t]} inspection` }))}
        />
        <Select
          label="Property"
          value={propertyId}
          onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); setTenantId(""); }}
          placeholder="Pick a property"
          options={props.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="Unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          placeholder={propertyId ? "Pick a unit" : "Pick a property first"}
          options={units.map((u) => ({ value: u.id, label: `Unit ${u.unitNumber}` }))}
          disabled={!propertyId}
        />
        {unitId && (
          unitTenants.length > 0 ? (
            <Select
              label="Tenant"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              options={unitTenants.map((t) => ({ value: t.id, label: t.name }))}
            />
          ) : (
            <p className="text-caption text-gray-500">
              {needsTenant ? "This unit has no tenant yet. Add the tenant first." : "No tenant on this unit — the inspection covers the unit only."}
            </p>
          )
        )}
        <Input label="Date and time" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        <Select label="Assign to" value={assignee ?? (isManager ? "" : myId ?? "")} onChange={(e) => setAssignee(e.target.value)} options={assigneeOptions} />
        {err && <p className="text-caption text-expense">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Book inspection</Button>
        </div>
      </div>
    </Modal>
  );
}
