"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";
import { VendorSelect } from "@/components/ui/VendorSelect";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { AssetDocuments, type AssetDocumentsHandle, type AssetDocument } from "@/components/assets/AssetDocuments";
import { ASSET_DOCUMENT_CATEGORY_LABEL, warrantyLifecycle } from "@/lib/asset-documents";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Wrench,
  CheckCircle2,
  History,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = {
  GENERATOR: "Generator",
  LIFT: "Lift/Elevator",
  HVAC: "HVAC",
  POOL: "Pool",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  SECURITY: "Security",
  APPLIANCE: "Appliance",
  FURNITURE: "Furniture",
  IT_EQUIPMENT: "IT Equipment",
  VEHICLE: "Vehicle",
  OTHER: "Other",
};

const CAT_BADGE: Record<string, "amber" | "blue" | "gold" | "red" | "green" | "gray"> = {
  GENERATOR: "amber",
  LIFT: "blue",
  HVAC: "gold",
  POOL: "blue",
  ELECTRICAL: "amber",
  PLUMBING: "blue",
  SECURITY: "red",
  APPLIANCE: "green",
  FURNITURE: "gray",
  IT_EQUIPMENT: "blue",
  VEHICLE: "gray",
  OTHER: "gray",
};

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  BIANNUALLY: "Bi-annually",
  ANNUALLY: "Annually",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface MaintenanceSchedule {
  id: string;
  taskName: string;
  description: string | null;
  frequency: string;
  lastDone: string | null;
  nextDue: string | null;
  isActive: boolean;
  estimatedCost?: number | null;
  recurringExpenseId?: string | null;
  _count?: { logs: number };
}

interface MaintenanceLog {
  id: string;
  date: string;
  description: string;
  cost: number | null;
  technician: string | null;
  notes: string | null;
  schedule: { taskName: string } | null;
  vendor: { id: string; name: string } | null;
}

interface Asset {
  id: string;
  propertyId: string;
  unitId: string | null;
  name: string;
  category: string;
  categoryOther: string | null;
  serialNumber: string | null;
  modelNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  replacementValue: number | null;
  warrantyExpiry: string | null;
  serviceProvider: string | null;
  serviceContact: string | null;
  vendorId: string | null;
  vendor: { id: string; name: string; phone: string | null } | null;
  notes: string | null;
  property: { name: string; currency: string | null };
  unit: { unitNumber: string } | null;
  documentsCount: number;
  documentCategories: string[];
  maintenanceSchedules: MaintenanceSchedule[];
}

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  propertyId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type WarrantyStatus = { label: string; variant: "red" | "amber" | "green" | "gray" };

function warrantyStatus(dateStr: string | null): WarrantyStatus {
  const { status, daysLeft } = warrantyLifecycle(dateStr);
  switch (status) {
    case "none":     return { label: "No Warranty", variant: "gray" };
    case "expired":  return { label: "Warranty expired", variant: "red" };
    case "expiring": return { label: `Warranty ends in ${daysLeft}d`, variant: "amber" };
    default:         return { label: "Under warranty", variant: "green" };
  }
}

function categoryLabel(a: { category: string; categoryOther: string | null }): string {
  if (a.category === "OTHER" && a.categoryOther) return a.categoryOther;
  return CAT_LABELS[a.category] ?? a.category;
}

type MaintStatus = { label: string; variant: "red" | "amber" | "green" | "gray" };
function maintenanceStatus(nextDue: string | null, lastDone: string | null): MaintStatus {
  if (!nextDue && !lastDone) return { label: "Not Scheduled", variant: "gray" };
  if (!nextDue) return { label: "Scheduled", variant: "green" };
  const days = daysUntil(nextDue);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, variant: "red" };
  if (days <= 30) return { label: `Due in ${days}d`, variant: "amber" };
  return { label: "OK", variant: "green" };
}

// ── Blank form ─────────────────────────────────────────────────────────────────

function blankForm() {
  return {
    propertyId: "",
    unitId: "",
    name: "",
    category: "APPLIANCE",
    categoryOther: "",
    serialNumber: "",
    modelNumber: "",
    purchaseDate: "",
    purchaseCost: "",
    replacementValue: "",
    warrantyExpiry: "",
    serviceProvider: "",
    serviceContact: "",
    vendorId: "" as string,
    notes: "",
  };
}

// ── Maintenance Panel ─────────────────────────────────────────────────────────

function MaintenancePanel({ assetId, currency }: { assetId: string; currency: string }) {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editSchedule, setEditSchedule] = useState<MaintenanceSchedule | null>(null);
  const [logModal, setLogModal] = useState<MaintenanceSchedule | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [schedForm, setSchedForm] = useState({
    taskName: "", description: "", frequency: "MONTHLY", lastDone: "", estimatedCost: "",
  });
  const [logVendorId, setLogVendorId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "", cost: "", technician: "", notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/assets/${assetId}/schedules`),
        fetch(`/api/assets/${assetId}/logs`),
      ]);
      if (sRes.ok) setSchedules(await sRes.json());
      if (lRes.ok) setLogs(await lRes.json());
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadData(); }, [loadData]);

  function openAddSchedule() {
    setEditSchedule(null);
    setSchedForm({ taskName: "", description: "", frequency: "MONTHLY", lastDone: "", estimatedCost: "" });
    setScheduleModal(true);
  }
  function openEditSchedule(s: MaintenanceSchedule) {
    setEditSchedule(s);
    setSchedForm({
      taskName: s.taskName,
      description: s.description ?? "",
      frequency: s.frequency,
      lastDone: s.lastDone ? s.lastDone.slice(0, 10) : "",
      estimatedCost: s.estimatedCost?.toString() ?? "",
    });
    setScheduleModal(true);
  }

  async function handleSaveSchedule() {
    if (!schedForm.taskName) { toast.error("Task name required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        taskName: schedForm.taskName,
        description: schedForm.description || null,
        frequency: schedForm.frequency,
        lastDone: schedForm.lastDone || null,
        estimatedCost: parseFloat(schedForm.estimatedCost) || 0,
      };
      let res: Response;
      if (editSchedule) {
        res = await fetch(`/api/assets/${assetId}/schedules/${editSchedule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/assets/${assetId}/schedules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Save failed"); return; }
      toast.success(editSchedule ? "Schedule updated" : "Schedule added");
      setScheduleModal(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchedule(id: string) {
    const res = await fetch(`/api/assets/${assetId}/schedules/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Schedule deleted"); await loadData(); }
    else toast.error("Delete failed");
    setDeleteScheduleId(null);
  }

  function openLogModal(s: MaintenanceSchedule) {
    setLogModal(s);
    setLogVendorId(null);
    setLogForm({ date: new Date().toISOString().slice(0, 10), description: `${s.taskName} completed`, cost: "", technician: "", notes: "" });
  }

  async function handleLogMaintenance() {
    if (!logModal || !logForm.date || !logForm.description) { toast.error("Date and description required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/schedules/${logModal.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: logForm.date,
          description: logForm.description,
          cost: logForm.cost ? parseFloat(logForm.cost) : null,
          technician: logForm.technician || null,
          vendorId: logVendorId || null,
          notes: logForm.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Failed"); return; }
      toast.success("Maintenance logged");
      setLogModal(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLog(logId: string) {
    const res = await fetch(`/api/assets/${assetId}/logs/${logId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Log deleted"); setLogs((l) => l.filter((x) => x.id !== logId)); }
    else toast.error("Delete failed");
    setDeleteLogId(null);
  }

  if (loading) return <div className="py-4 flex justify-center"><Spinner size="sm" /></div>;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
      {/* Schedules */}
      <div className="flex items-center justify-between">
        <h4 className="text-label font-semibold text-gray-500 uppercase ">Maintenance Schedules</h4>
        <button
          onClick={openAddSchedule}
          className="flex items-center gap-1 text-caption text-gold hover:text-gold-dark transition-colors"
        >
          <Plus size={12} /> Add Schedule
        </button>
      </div>

      {schedules.length === 0 && (
        <p className="text-body text-gray-400 ">No maintenance schedules defined.</p>
      )}

      {schedules.map((s) => {
        const ms = maintenanceStatus(s.nextDue, s.lastDone);
        return (
          <div key={s.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className=" font-medium text-body text-header">{s.taskName}</span>
                <Badge variant="blue">{FREQ_LABELS[s.frequency] ?? s.frequency}</Badge>
                <Badge variant={ms.variant}>{ms.label}</Badge>
                {s.estimatedCost && s.estimatedCost > 0 && (
                  <span className="text-caption text-gray-400">Est. {formatCurrency(s.estimatedCost, currency)}</span>
                )}
                {s.recurringExpenseId && <Badge variant="green">Recurring</Badge>}
              </div>
              {s.description && <p className="text-caption text-gray-500 mt-0.5">{s.description}</p>}
              <div className="flex gap-3 mt-1 text-caption text-gray-400">
                {s.lastDone && <span>Last done: {formatDate(new Date(s.lastDone))}</span>}
                {s.nextDue && <span>Next due: {formatDate(new Date(s.nextDue))}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openLogModal(s)}
                className="flex items-center gap-1 text-caption text-green-600 hover:text-green-700 px-2 py-1 rounded-md hover:bg-green-50 transition-colors"
              >
                <CheckCircle2 size={12} /> Log
              </button>
              <button
                onClick={() => openEditSchedule(s)}
                className="flex items-center gap-1 text-caption text-gray-500 hover:text-header px-2 py-1 rounded-md hover:bg-cream transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => setDeleteScheduleId(s.id)}
                className="flex items-center gap-1 text-caption text-gray-400 hover:text-expense px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Recent logs */}
      {logs.length > 0 && (
        <div>
          <h4 className="text-label font-semibold text-gray-500 uppercase mb-2">
            <History size={11} className="inline mr-1" />Maintenance History
          </h4>
          <div className="space-y-1.5">
            {logs.slice(0, 8).map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-2 text-caption ">
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400">{formatDate(new Date(log.date))}</span>
                  {log.schedule && <span className="mx-1 text-blue-500">[{log.schedule.taskName}]</span>}
                  <span className="text-header"> {log.description}</span>
                  {(log.vendor?.name || log.technician) && <span className="text-gray-400"> · {log.vendor?.name ?? log.technician}</span>}
                  {log.cost != null && <span className="text-expense font-medium"> · {formatCurrency(log.cost, currency)}</span>}
                </div>
                <button
                  onClick={() => setDeleteLogId(log.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0 mt-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule modal */}
      <Modal
        open={scheduleModal}
        onClose={() => setScheduleModal(false)}
        title={editSchedule ? "Edit Schedule" : "Add Maintenance Schedule"}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Task Name <span className="text-expense">*</span></label>
            <input
              type="text"
              value={schedForm.taskName}
              onChange={(e) => setSchedForm((f) => ({ ...f, taskName: e.target.value }))}
              placeholder="e.g. Generator oil change"
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={schedForm.description}
              onChange={(e) => setSchedForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Optional task details..."
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Frequency <span className="text-expense">*</span></label>
              <select
                value={schedForm.frequency}
                onChange={(e) => setSchedForm((f) => ({ ...f, frequency: e.target.value }))}
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                {Object.entries(FREQ_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Last Done (optional)</label>
              <input
                type="date"
                value={schedForm.lastDone}
                onChange={(e) => setSchedForm((f) => ({ ...f, lastDone: e.target.value }))}
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Estimated Cost</label>
            <input
              type="number"
              min="0"
              value={schedForm.estimatedCost}
              onChange={(e) => setSchedForm((f) => ({ ...f, estimatedCost: e.target.value }))}
              placeholder="0"
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            {parseFloat(schedForm.estimatedCost) > 0 && schedForm.frequency !== "WEEKLY" && (
              <p className="text-caption text-gold mt-1">A recurring expense will be created for financial tracking</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setScheduleModal(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveSchedule} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editSchedule ? "Save changes" : "Add schedule"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Log maintenance modal */}
      <Modal
        open={!!logModal}
        onClose={() => setLogModal(null)}
        title={`Log: ${logModal?.taskName ?? ""}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Date <span className="text-expense">*</span></label>
              <input
                type="date"
                value={logForm.date}
                onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Cost</label>
              <input
                type="number"
                value={logForm.cost}
                onChange={(e) => setLogForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Description <span className="text-expense">*</span></label>
            <input
              type="text"
              value={logForm.description}
              onChange={(e) => setLogForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What was done?"
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>
          <VendorSelect
            label="Technician / Vendor"
            value={logVendorId}
            onChange={setLogVendorId}
          />
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={logForm.notes}
              onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Additional notes..."
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setLogModal(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleLogMaintenance} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Log maintenance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm deletes */}
      <ConfirmDialog
        open={!!deleteScheduleId}
        title="Delete schedule"
        message="Delete this maintenance schedule and all its history logs?"
        confirmLabel="Delete"
        onConfirm={() => deleteScheduleId && handleDeleteSchedule(deleteScheduleId)}
        onClose={() => setDeleteScheduleId(null)}
      />
      <ConfirmDialog
        open={!!deleteLogId}
        title="Delete log entry"
        message="Delete this maintenance log entry?"
        confirmLabel="Delete"
        onConfirm={() => deleteLogId && handleDeleteLog(deleteLogId)}
        onClose={() => setDeleteLogId(null)}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { data: session } = useSession();
  const { selectedId, currency } = useProperty();
  useFocusScroll();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterWarranty, setFilterWarranty] = useState("");
  const [search, setSearch] = useState("");
  const [expandedPanel, setExpandedPanel] = useState<{ assetId: string; tab: "documents" | "maintenance" } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());
  const docsRef = useRef<AssetDocumentsHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const propParam = selectedId ? `?propertyId=${selectedId}` : "";
      const [assetRes, propRes] = await Promise.all([
        fetch(`/api/assets${propParam}`),
        fetch("/api/properties?minimal=true"),
      ]);
      if (assetRes.ok) setAssets(await assetRes.json());
      if (propRes.ok) setProperties(await propRes.json());
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  // Load units when property changes in form
  useEffect(() => {
    if (!form.propertyId) { setUnits([]); return; }
    fetch(`/api/units?propertyId=${form.propertyId}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setUnits)
      .catch(() => setUnits([]));
  }, [form.propertyId]);

  function openAdd() {
    setEditAsset(null);
    setForm({ ...blankForm(), propertyId: selectedId ?? "" });
    setUnits([]);
    setModalOpen(true);
  }

  function closeModal() {
    if (!editAsset && docsRef.current?.hasQueued() && !window.confirm("Files you added have not been uploaded yet. Discard them?")) return;
    setModalOpen(false);
  }

  function openEdit(a: Asset) {
    setEditAsset(a);
    setForm({
      propertyId: a.propertyId,
      unitId: a.unitId ?? "",
      name: a.name,
      category: a.category,
      categoryOther: a.categoryOther ?? "",
      serialNumber: a.serialNumber ?? "",
      modelNumber: a.modelNumber ?? "",
      purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : "",
      purchaseCost: a.purchaseCost?.toString() ?? "",
      replacementValue: a.replacementValue?.toString() ?? "",
      warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.slice(0, 10) : "",
      serviceProvider: a.serviceProvider ?? "",
      serviceContact: a.serviceContact ?? "",
      vendorId: a.vendorId ?? "",
      notes: a.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.propertyId || !form.name) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        propertyId: form.propertyId,
        unitId: form.unitId || null,
        name: form.name,
        category: form.category,
        categoryOther: form.categoryOther || null,
        serialNumber: form.serialNumber || null,
        modelNumber: form.modelNumber || null,
        purchaseDate: form.purchaseDate || null,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : null,
        replacementValue: form.replacementValue ? parseFloat(form.replacementValue) : null,
        warrantyExpiry: form.warrantyExpiry || null,
        serviceProvider: form.serviceProvider || null,
        serviceContact: form.serviceContact || null,
        vendorId: form.vendorId || null,
        notes: form.notes || null,
      };

      const url = editAsset ? `/api/assets/${editAsset.id}` : "/api/assets";
      const method = editAsset ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof body.error === "string" ? body.error : body.error?.formErrors?.[0] || "Save failed");
        return;
      }

      if (editAsset) {
        toast.success("Asset updated");
      } else {
        // New asset: push any files chosen in the form now that it has an id.
        const created = body as Asset;
        if (docsRef.current?.hasQueued()) {
          const { done, failed } = await docsRef.current.uploadAllTo(created.id);
          if (failed.length === 0) {
            toast.success(`Asset created · ${done} document${done === 1 ? "" : "s"} attached`);
          } else {
            // Keep the form open on the saved asset so the failed rows keep their Retry button.
            toast.error(`Asset created, but ${failed.length} document${failed.length === 1 ? "" : "s"} failed to upload. Retry below or close to leave them off.`);
            setEditAsset(created);
            setExpandedPanel({ assetId: created.id, tab: "documents" });
            await load();
            return;
          }
        } else {
          toast.success("Asset created");
        }
        setExpandedPanel({ assetId: created.id, tab: "documents" });
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Asset deleted");
      setAssets((a) => a.filter((x) => x.id !== id));
    } else {
      toast.error("Delete failed");
    }
    setDeleteId(null);
  }

  function onDocsChanged(assetId: string, docs: AssetDocument[]) {
    setAssets((list) => list.map((a) => a.id === assetId
      ? { ...a, documentsCount: docs.length, documentCategories: Array.from(new Set(docs.map((d) => d.category))) }
      : a));
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = assets.filter((a) => {
    if (filterProperty && a.propertyId !== filterProperty) return false;
    if (filterCategory && a.category !== filterCategory) return false;
    if (filterWarranty && warrantyLifecycle(a.warrantyExpiry).status !== filterWarranty) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !(a.serialNumber ?? "").toLowerCase().includes(q) &&
        !(a.modelNumber ?? "").toLowerCase().includes(q) &&
        !(a.serviceProvider ?? "").toLowerCase().includes(q) &&
        !(a.vendor?.name ?? "").toLowerCase().includes(q) &&
        !(a.categoryOther ?? "").toLowerCase().includes(q) &&
        !a.property.name.toLowerCase().includes(q) &&
        !(a.unit?.unitNumber ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const totalAssets = assets.length;
  const totalValue = assets.reduce((s, a) => s + (a.purchaseCost ?? 0), 0);
  const totalReplacement = assets.reduce((s, a) => s + (a.replacementValue ?? 0), 0);
  const withReplacement = assets.filter((a) => a.replacementValue != null).length;
  const warrantiesExpiring = assets.filter((a) => {
    if (!a.warrantyExpiry) return false;
    const d = daysUntil(a.warrantyExpiry);
    return d >= 0 && d <= 90;
  }).length;
  const distinctCategories = new Set(assets.map((a) => a.category)).size;
  const maintenanceDue = assets.reduce((count, a) => {
    const overdue = a.maintenanceSchedules.filter((s) => {
      if (!s.nextDue) return false;
      return daysUntil(s.nextDue) <= 30;
    });
    return count + (overdue.length > 0 ? 1 : 0);
  }, 0);

  // ── Alert banner ──────────────────────────────────────────────────────────

  // Ending within 90 days, or ended in the last 90 — a warranty that lapsed
  // years ago is history, not something to act on.
  const alertAssets = assets.filter((a) => {
    if (!a.warrantyExpiry) return false;
    const d = daysUntil(a.warrantyExpiry);
    return d <= 90 && d >= -90;
  });

  const maintAlertAssets = assets.filter((a) =>
    a.maintenanceSchedules.some((s) => s.nextDue && daysUntil(s.nextDue) <= 30)
  );

  // Units filtered by selected property in form
  const formUnits = units.filter((u) => u.propertyId === form.propertyId);

  return (
    <>
      <Header title="Asset Register" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Warranty alert banner */}
        {alertAssets.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-body font-semibold text-amber-800">
                {alertAssets.length} {alertAssets.length === 1 ? "asset warranty" : "asset warranties"} require attention
              </p>
              <ul className="mt-1 space-y-0.5">
                {alertAssets.map((a) => {
                  const days = daysUntil(a.warrantyExpiry!);
                  return (
                    <li key={a.id} className="text-caption text-amber-700">
                      <span className="font-medium">{a.name}</span> ({a.property.name}) —{" "}
                      {days < 0
                        ? `warranty expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`
                        : `warranty expires in ${days} day${days !== 1 ? "s" : ""}`}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* Maintenance alert banner */}
        {maintAlertAssets.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
            <Wrench size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-body font-semibold text-blue-800">
                {maintAlertAssets.length} {maintAlertAssets.length === 1 ? "asset has" : "assets have"} maintenance due within 30 days
              </p>
              <ul className="mt-1 space-y-0.5">
                {maintAlertAssets.map((a) => {
                  const dueSoon = a.maintenanceSchedules.filter((s) => s.nextDue && daysUntil(s.nextDue) <= 30);
                  return (
                    <li key={a.id} className="text-caption text-blue-700">
                      <span className="font-medium">{a.name}</span> ({a.property.name}) —{" "}
                      {dueSoon.map((s) => {
                        const d = daysUntil(s.nextDue!);
                        return d < 0 ? `${s.taskName} overdue` : `${s.taskName} in ${d}d`;
                      }).join(", ")}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Total Assets</p>
            <p className="text-h1 text-header mt-1">{totalAssets}</p>
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Purchase / Replacement Value</p>
            <p className="text-h3 text-header mt-1">{formatCurrency(totalValue, currency)}</p>
            <p className="text-caption text-gray-400 mt-0.5" title="Sum of replacement values — what a contents policy should cover">
              {withReplacement > 0 ? `${formatCurrency(totalReplacement, currency)} to replace (${withReplacement} of ${totalAssets} valued)` : "No replacement values recorded"}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Warranties Expiring</p>
            <p className="text-h1 text-expense mt-1">{warrantiesExpiring}</p>
            <p className="text-caption text-gray-400 mt-0.5">within 90 days</p>
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Maintenance Due</p>
            <p className="text-h1 text-expense mt-1">{maintenanceDue}</p>
            <p className="text-caption text-gray-400 mt-0.5">within 30 days</p>
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">All categories</option>
            {Object.entries(CAT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterWarranty}
            onChange={(e) => setFilterWarranty(e.target.value)}
            className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">Any warranty</option>
            <option value="valid">Under warranty</option>
            <option value="expiring">Warranty ending soon</option>
            <option value="expired">Warranty expired</option>
            <option value="none">No warranty</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, serial, model, vendor, unit..."
            className="flex-1 min-w-[200px] text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
          <Button onClick={openAdd} className="ml-auto flex items-center gap-2">
            <Plus size={15} /> Add Asset
          </Button>
        </div>

        {/* Asset list */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={assets.length === 0 ? "No assets registered" : "No assets match these filters"}
            description={assets.length === 0 ? "Add your first asset to start tracking equipment, appliances, warranties and the paperwork behind them." : "Try clearing the category, warranty or search filters."}
            action={assets.length === 0 ? <Button onClick={openAdd}><Plus size={14} className="mr-1" />Add Asset</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((asset) => {
              const ws = warrantyStatus(asset.warrantyExpiry);
              const assetCurrency = asset.property.currency ?? currency;
              const provider = asset.vendor
                ? [asset.vendor.name, asset.vendor.phone].filter(Boolean).join(" · ")
                : [asset.serviceProvider, asset.serviceContact].filter(Boolean).join(" · ");

              return (
                <div key={asset.id} id={`item-${asset.id}`}>
                <Card className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={CAT_BADGE[asset.category] ?? "gray"}>{categoryLabel(asset)}</Badge>
                        <span className=" font-semibold text-header">{asset.name}</span>
                        {asset.serialNumber && (
                          <span className="tabular-nums text-caption text-gray-400">S/N: {asset.serialNumber}</span>
                        )}
                      </div>
                      <p className="text-caption text-gray-500 mt-0.5">
                        {asset.property.name}
                        {asset.unit && ` · Unit ${asset.unit.unitNumber}`}
                      </p>
                    </div>
                  </div>

                  {/* Body grid */}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-body ">
                    <div>
                      <span className="text-gray-400 text-caption">Purchase Date</span>
                      <p className="text-header">
                        {asset.purchaseDate ? formatDate(new Date(asset.purchaseDate)) : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-caption">Purchase Cost</span>
                      <p className="text-header font-medium">
                        {asset.purchaseCost ? formatCurrency(asset.purchaseCost, assetCurrency) : "—"}
                        {asset.replacementValue != null && (
                          <span className="text-caption text-gray-400 font-normal" title="Replacement value"> · {formatCurrency(asset.replacementValue, assetCurrency)} to replace</span>
                        )}
                      </p>
                    </div>
                    {asset.modelNumber && (
                      <div>
                        <span className="text-gray-400 text-caption">Model</span>
                        <p className="text-header tabular-nums text-caption">{asset.modelNumber}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400 text-caption">Warranty Expiry</span>
                      <p className="text-header flex items-center gap-1.5">
                        {asset.warrantyExpiry
                          ? formatDate(new Date(asset.warrantyExpiry))
                          : "—"}
                        <Badge variant={ws.variant}>{ws.label}</Badge>
                      </p>
                    </div>
                    {provider && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-caption">Service Provider</span>
                        <p className="text-header">{provider}</p>
                      </div>
                    )}
                    {asset.notes && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-caption">Notes</span>
                        <p className="text-header whitespace-pre-wrap">{asset.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Paperwork on file */}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {asset.documentCategories.length === 0 ? (
                      <span className="text-caption text-gray-400">No documents on file</span>
                    ) : (
                      asset.documentCategories.map((c) => (
                        <span key={c} className="text-label uppercase font-medium px-1.5 py-0.5 rounded bg-cream text-header border border-cream-dark">
                          {ASSET_DOCUMENT_CATEGORY_LABEL[c] ?? c}
                        </span>
                      ))
                    )}
                    {asset.warrantyExpiry && warrantyLifecycle(asset.warrantyExpiry).status !== "expired" && !asset.documentCategories.includes("WARRANTY") && (
                      <span className="text-label uppercase font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title="Upload the warranty card so a claim has something to lean on">
                        No warranty document
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {asset.maintenanceSchedules.length > 0 && (
                      <Badge variant={maintenanceStatus(
                        asset.maintenanceSchedules.reduce((min, s) => {
                          if (!s.nextDue) return min;
                          if (!min) return s.nextDue;
                          return s.nextDue < min ? s.nextDue : min;
                        }, null as string | null),
                        null
                      ).variant}>
                        {asset.maintenanceSchedules.length} schedule{asset.maintenanceSchedules.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    <button
                      onClick={() => setExpandedPanel(
                        expandedPanel?.assetId === asset.id && expandedPanel.tab === "documents" ? null : { assetId: asset.id, tab: "documents" }
                      )}
                      className={`flex items-center gap-1 text-caption transition-colors px-2 py-1 rounded-md ${
                        expandedPanel?.assetId === asset.id && expandedPanel.tab === "documents"
                          ? "text-gold bg-cream"
                          : "text-gray-500 hover:text-header hover:bg-cream"
                      }`}
                    >
                      <FileText size={12} /> {asset.documentsCount} doc{asset.documentsCount !== 1 ? "s" : ""}
                      {expandedPanel?.assetId === asset.id && expandedPanel.tab === "documents" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      onClick={() => setExpandedPanel(
                        expandedPanel?.assetId === asset.id && expandedPanel.tab === "maintenance" ? null : { assetId: asset.id, tab: "maintenance" }
                      )}
                      className={`flex items-center gap-1 text-caption transition-colors px-2 py-1 rounded-md ${
                        expandedPanel?.assetId === asset.id && expandedPanel.tab === "maintenance"
                          ? "text-gold bg-cream"
                          : "text-gray-500 hover:text-header hover:bg-cream"
                      }`}
                    >
                      <Wrench size={12} /> Maintenance
                      {expandedPanel?.assetId === asset.id && expandedPanel.tab === "maintenance" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => openEdit(asset)} className="flex items-center gap-1 text-caption text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream">
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setDeleteId(asset.id)} className="flex items-center gap-1 text-caption text-gray-500 hover:text-expense transition-colors px-2 py-1 rounded-md hover:bg-red-50">
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Expandable panels */}
                  {expandedPanel?.assetId === asset.id && expandedPanel.tab === "documents" && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <h4 className="text-label font-semibold text-gray-500 uppercase mb-2">Documents</h4>
                      <AssetDocuments assetId={asset.id} onChanged={(docs) => onDocsChanged(asset.id, docs)} />
                    </div>
                  )}
                  {expandedPanel?.assetId === asset.id && expandedPanel.tab === "maintenance" && (
                    <MaintenancePanel assetId={asset.id} currency={assetCurrency} />
                  )}
                </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editAsset ? "Edit Asset" : "Add Asset"}
        size="xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Property */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Property <span className="text-expense">*</span>
            </label>
            <select
              value={form.propertyId}
              onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value, unitId: "" }))}
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Unit (optional) */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Unit (optional)
            </label>
            <select
              value={form.unitId}
              onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
              disabled={!form.propertyId}
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:opacity-50"
            >
              <option value="">No specific unit</option>
              {formUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.unitNumber}</option>
              ))}
            </select>
          </div>

          {/* Asset Name */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Asset Name <span className="text-expense">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Backup Generator"
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Category <span className="text-expense">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              {Object.entries(CAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {form.category === "OTHER" && (
              <input
                type="text"
                value={form.categoryOther}
                onChange={(e) => setForm((f) => ({ ...f, categoryOther: e.target.value }))}
                placeholder="Specify category..."
                className="mt-2 w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            )}
          </div>

          {/* Serial / Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                placeholder="S/N"
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Model Number
              </label>
              <input
                type="text"
                value={form.modelNumber}
                onChange={(e) => setForm((f) => ({ ...f, modelNumber: e.target.value }))}
                placeholder="Model"
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>

          {/* Purchase Date / Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Purchase Cost
              </label>
              <input
                type="number"
                value={form.purchaseCost}
                onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>

          {/* Replacement value / Warranty Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Replacement Value <span className="text-gray-400 font-normal">(today)</span>
              </label>
              <input
                type="number"
                value={form.replacementValue}
                onChange={(e) => setForm((f) => ({ ...f, replacementValue: e.target.value }))}
                placeholder="0"
                min="0"
                title="What it would cost to replace now — the figure a contents policy should cover"
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Warranty Expiry
              </label>
              <input
                type="date"
                value={form.warrantyExpiry}
                onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>

          {/* Service Provider */}
          <VendorSelect
            label="Service Provider"
            value={form.vendorId || null}
            onChange={(v) => setForm((f) => ({ ...f, vendorId: v ?? "" }))}
          />

          {/* Notes */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Additional notes..."
              className="w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
            />
          </div>

          {/* Documents */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-caption font-medium text-gray-500 mb-1">Documents</label>
            <p className="text-caption text-gray-400 mb-2">Warranty card, manual, purchase invoice, service reports, test certificates and photos.</p>
            {modalOpen && (
              <AssetDocuments
                ref={docsRef}
                assetId={editAsset?.id}
                onChanged={editAsset ? (docs) => onDocsChanged(editAsset.id, docs) : undefined}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              {editAsset ? "Close" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editAsset ? "Save changes" : "Create asset"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete asset"
        message="Are you sure you want to delete this asset? All attached documents will also be removed."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onClose={() => setDeleteId(null)}
      />
    </>
  );
}
