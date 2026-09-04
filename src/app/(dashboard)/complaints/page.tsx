"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
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
import { formatRelativeWithTooltip } from "@/lib/relative-time";
import { COMPLAINT_CATEGORY_LABEL, categoriesSelectableBy, type ComplaintCategory } from "@/lib/complaint-rules";
import { MessageSquareWarning, Plus, Paperclip, Clock } from "lucide-react";

// ─── Types (API DTO) ──────────────────────────────────────────────────────────

interface ComplaintDto {
  id: string;
  propertyId: string;
  property: { id: string; name: string; currency: string };
  unit: { id: string; unitNumber: string } | null;
  subjectUnit: { id: string; unitNumber: string } | null;
  tenant: { id: string; name: string; phone: string | null } | null;
  category: ComplaintCategory;
  title: string;
  description: string | null;
  source: "STAFF" | "PORTAL";
  raisedByName: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  caseThread: {
    id: string; status: string; stage: string | null; currentStageIndex: number; waitingOn: string;
    lastActivityAt: string; slaDueAt: string | null;
  } | null;
}

interface PropertyOption { id: string; name: string; units?: { id: string; unitNumber: string }[] }
interface TenantOption { id: string; name: string; phone: string | null; unit: { id: string; unitNumber: string; propertyId: string } }

const STATUS_BADGE: Record<string, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red", IN_PROGRESS: "amber", AWAITING_APPROVAL: "gold", AWAITING_VENDOR: "blue", AWAITING_TENANT: "blue", RESOLVED: "green", CLOSED: "gray",
};

function slaLabel(iso: string | null, status: string | undefined): { text: string; overdue: boolean } | null {
  if (!iso || status === "RESOLVED" || status === "CLOSED") return null;
  const due = new Date(iso);
  const overdue = due.getTime() < Date.now();
  const { short } = formatRelativeWithTooltip(due);
  return { text: overdue ? `SLA missed ${short}` : `SLA due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, overdue };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const { selectedId } = useProperty();

  const [rows, setRows] = useState<ComplaintDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"open" | "resolved" | "all">("open");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedId) qs.set("propertyId", selectedId);
      if (scope === "open") qs.set("open", "true");
      if (category) qs.set("category", category);
      const res = await fetch(`/api/complaints?${qs}`);
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      toast.error("Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, [selectedId, scope, category]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (scope === "resolved" && !(r.caseThread?.status === "RESOLVED" || r.caseThread?.status === "CLOSED")) return false;
    if (source && r.source !== source) return false;
    return true;
  }), [rows, scope, source]);

  const overdue = filtered.filter((r) => slaLabel(r.caseThread?.slaDueAt ?? null, r.caseThread?.status)?.overdue).length;

  return (
    <div>
      <Header title="Complaints" userName={session?.user?.name ?? session?.user?.email} role={orgRole}>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-1" /> Log complaint
        </Button>
      </Header>

      <div className="page-container space-y-4 pb-24 lg:pb-8">
        {/* Filters */}
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["open", "resolved", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={clsx("px-3 py-1.5 text-caption font-medium transition-colors", scope === s ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50")}
                >
                  {s === "open" ? "Open" : s === "resolved" ? "Resolved" : "All"}
                </button>
              ))}
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30">
              <option value="">All categories</option>
              {categoriesSelectableBy(orgRole).map((c) => <option key={c} value={c}>{COMPLAINT_CATEGORY_LABEL[c]}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="text-body border border-gray-200 rounded-lg px-3 py-1.5 bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30">
              <option value="">Any source</option>
              <option value="PORTAL">Tenant portal</option>
              <option value="STAFF">Logged by staff</option>
            </select>
            {overdue > 0 && (
              <span className="ml-auto text-caption font-medium text-expense">{overdue} past SLA</span>
            )}
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={28} />}
            title={scope === "open" ? "No open complaints" : "No complaints"}
            description="Log a complaint when a tenant raises an issue with you on site — noise, security, a neighbour, the premises."
            action={<Button size="sm" onClick={() => setShowForm(true)}><Plus size={14} className="mr-1" /> Log complaint</Button>}
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => <ComplaintCard key={r.id} r={r} />)}
            </div>
            {/* Desktop table */}
            <Card padding="none" className="hidden md:block overflow-x-auto">
              <table className="w-full text-body">
                <thead className="bg-gray-50 text-label uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3">Complaint</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Where</th>
                    <th className="text-left px-4 py-3">Tenant</th>
                    <th className="text-left px-4 py-3">Stage</th>
                    <th className="text-left px-4 py-3">SLA</th>
                    <th className="text-left px-4 py-3">Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => {
                    const sla = slaLabel(r.caseThread?.slaDueAt ?? null, r.caseThread?.status);
                    const act = r.caseThread ? formatRelativeWithTooltip(r.caseThread.lastActivityAt) : null;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/complaints/${r.id}`} className="font-medium text-gray-900 hover:text-gold">{r.title}</Link>
                          <div className="text-caption text-gray-400 flex items-center gap-1.5 mt-0.5">
                            <Badge variant={r.source === "PORTAL" ? "blue" : "gray"}>{r.source === "PORTAL" ? "Portal" : "Staff"}</Badge>
                            <span>by {r.raisedByName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Badge variant="gray">{COMPLAINT_CATEGORY_LABEL[r.category] ?? r.category}</Badge></td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.property.name}{r.subjectUnit ? ` · ${r.subjectUnit.unitNumber}` : r.unit ? ` · ${r.unit.unitNumber}` : ""}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.tenant?.name ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {r.caseThread && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant={STATUS_BADGE[r.caseThread.status] ?? "gray"}>{r.caseThread.stage ?? r.caseThread.status}</Badge>
                            </div>
                          )}
                        </td>
                        <td className={clsx("px-4 py-3 text-caption", sla?.overdue ? "text-expense font-medium" : "text-gray-500")}>{sla?.text ?? "—"}</td>
                        <td className="px-4 py-3 text-caption text-gray-500" title={act?.full}>{act?.short}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>

      {showForm && (
        <LogComplaintModal
          orgRole={orgRole}
          defaultPropertyId={selectedId}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function ComplaintCard({ r }: { r: ComplaintDto }) {
  const sla = slaLabel(r.caseThread?.slaDueAt ?? null, r.caseThread?.status);
  const act = r.caseThread ? formatRelativeWithTooltip(r.caseThread.lastActivityAt) : null;
  return (
    <Link href={`/complaints/${r.id}`} className="block">
      <Card padding="sm" className="hover:border-gold/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <p className="text-body font-medium text-header truncate">{r.title}</p>
          {r.caseThread && <Badge variant={STATUS_BADGE[r.caseThread.status] ?? "gray"}>{r.caseThread.stage ?? r.caseThread.status}</Badge>}
        </div>
        <p className="text-caption text-gray-400 mt-0.5 truncate">
          {COMPLAINT_CATEGORY_LABEL[r.category] ?? r.category} · {r.property.name}
          {r.subjectUnit ? ` · ${r.subjectUnit.unitNumber}` : r.unit ? ` · ${r.unit.unitNumber}` : ""}
          {r.tenant ? ` · ${r.tenant.name}` : ""}
        </p>
        <div className="flex items-center justify-between mt-2 text-caption">
          <span className={clsx(sla?.overdue ? "text-expense font-medium" : "text-gray-400")}>{sla?.text ?? (r.source === "PORTAL" ? "Tenant portal" : `By ${r.raisedByName}`)}</span>
          {act && <span className="text-gray-400 flex items-center gap-1" title={act.full}><Clock size={11} /> {act.short}</span>}
        </div>
      </Card>
    </Link>
  );
}

// ─── Log complaint modal ──────────────────────────────────────────────────────

function LogComplaintModal({ orgRole, defaultPropertyId, onClose, onCreated }: {
  orgRole?: string; defaultPropertyId: string | null; onClose: () => void; onCreated: () => void;
}) {
  const { data: properties } = useCachedFetch<PropertyOption[]>("properties:full", "/api/properties");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [tenantId, setTenantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [subjectUnitId, setSubjectUnitId] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("NOISE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const props = properties ?? [];
  const units = props.find((p) => p.id === propertyId)?.units ?? [];

  useEffect(() => {
    if (!propertyId && props.length === 1) setPropertyId(props[0].id);
  }, [props, propertyId]);

  // Tenant directory for the property — the trimmed shape (name / phone / unit).
  useEffect(() => {
    if (!propertyId) { setTenants([]); return; }
    fetch(`/api/tenants?projection=directory&propertyId=${propertyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTenants)
      .catch(() => setTenants([]));
  }, [propertyId]);

  function pickTenant(id: string) {
    setTenantId(id);
    const t = tenants.find((x) => x.id === id);
    if (t) setUnitId(t.unit.id);
  }

  async function submit() {
    setErr(null);
    if (!propertyId) { setErr("Pick a property"); return; }
    if (title.trim().length < 3) { setErr("Give the complaint a short title"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, unitId: unitId || null, tenantId: tenantId || null, subjectUnitId: subjectUnitId || null,
          category, title: title.trim(), description: description.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(typeof body.error === "string" ? body.error : "Could not log the complaint"); return; }
      if (files.length > 0) {
        const form = new FormData();
        files.forEach((f) => form.append("file", f));
        form.append("visibleToTenant", "false");
        const up = await fetch(`/api/complaints/${body.id}/events`, { method: "POST", body: form });
        if (!up.ok) toast.error("Complaint logged, but the photos failed to upload — add them from the complaint page.");
      }
      toast.success("Complaint logged");
      onCreated();
    } catch {
      setErr("Could not log the complaint");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Log complaint" size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label="Property *" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setTenantId(""); setUnitId(""); setSubjectUnitId(""); }}
            options={[{ value: "", label: "Select property…" }, ...props.map((p) => ({ value: p.id, label: p.name }))]} />
          <Select label="Category *" value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
            options={categoriesSelectableBy(orgRole).map((c) => ({ value: c, label: COMPLAINT_CATEGORY_LABEL[c] }))} />
          <Select label="Complainant (tenant)" value={tenantId} onChange={(e) => pickTenant(e.target.value)}
            options={[{ value: "", label: "Not a specific tenant / common area" }, ...tenants.map((t) => ({ value: t.id, label: `${t.unit.unitNumber} · ${t.name}` }))]}
            tooltip="Who raised it — they are kept updated. Leave blank for something you noticed yourself." />
          <Select label="Their unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}
            options={[{ value: "", label: "—" }, ...units.map((u) => ({ value: u.id, label: u.unitNumber }))]} />
          <Select label="Unit concerned" value={subjectUnitId} onChange={(e) => setSubjectUnitId(e.target.value)}
            options={[{ value: "", label: "Same as above / whole property" }, ...units.map((u) => ({ value: u.id, label: u.unitNumber }))]}
            tooltip="The unit the complaint is about, when it is not the complainant's own — e.g. noise from 4B." />
        </div>
        <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Generator running all night" />
        <div>
          <label className="block text-caption font-medium text-gray-600 mb-1">What happened</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
            placeholder="When, where, who was involved, what the tenant asked for…" />
        </div>
        <div>
          <label className="block text-caption font-medium text-gray-600 mb-1">Photos</label>
          <input type="file" multiple accept="image/*,application/pdf" capture="environment" className="text-caption"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {files.length > 0 && <p className="text-caption text-gray-400 mt-1 flex items-center gap-1"><Paperclip size={11} /> {files.length} file{files.length === 1 ? "" : "s"} attached</p>}
        </div>
        {err && <p className="text-caption text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button onClick={submit} loading={saving}>Log complaint</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
