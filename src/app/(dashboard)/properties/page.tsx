"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Building2, Plus, Users, PencilLine, ChevronDown, ChevronUp, Trash2, Home } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Unit {
  id: string;
  unitNumber: string;
  type: string;
  status: string;
  monthlyRent: number | null;
  floor: number | null;
  sizeSqm: number | null;
  description: string | null;
}

interface Property {
  id: string;
  name: string;
  type: "AIRBNB" | "LONGTERM";
  address: string | null;
  city: string | null;
  description: string | null;
  managementFeeRate: number | null;
  managementFeeFlat: number | null;
  serviceChargeDefault: number | null;
  units: Unit[];
  owner: { id: string; name: string | null; email: string | null } | null;
  _count: { units: number };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const propertySchema = z.object({
  name: z.string().min(1, "Name required"),
  type: z.enum(["AIRBNB", "LONGTERM"]),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  managementFeeRate: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0).max(100).optional()
  ),
  managementFeeFlat: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0).optional()
  ),
  serviceChargeDefault: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0).optional()
  ),
});
type PropertyForm = z.infer<typeof propertySchema>;

const unitSchema = z.object({
  unitNumber: z.string().min(1, "Unit number required"),
  type: z.enum(["BEDSITTER", "ONE_BED", "TWO_BED", "THREE_BED", "FOUR_BED", "PENTHOUSE", "COMMERCIAL", "OTHER"]),
  status: z.enum(["ACTIVE", "VACANT", "LISTED", "UNDER_NOTICE", "MAINTENANCE", "OWNER_OCCUPIED"]),
  monthlyRent: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0).optional()
  ),
  floor: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().optional()
  ),
  sizeSqm: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0).optional()
  ),
  description: z.string().optional(),
});
type UnitForm = z.infer<typeof unitSchema>;

// ─── Label maps ───────────────────────────────────────────────────────────────

const UNIT_TYPE_LABELS: Record<string, string> = {
  BEDSITTER: "Bedsitter",
  ONE_BED: "1 Bedroom",
  TWO_BED: "2 Bedroom",
  THREE_BED: "3 Bedroom",
  FOUR_BED: "4 Bedroom",
  PENTHOUSE: "Penthouse",
  COMMERCIAL: "Commercial",
  OTHER: "Other",
};

const UNIT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Occupied",
  VACANT: "Vacant",
  LISTED: "Listed",
  UNDER_NOTICE: "Under Notice",
  MAINTENANCE: "Maintenance",
  OWNER_OCCUPIED: "Owner Occupied",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-income",
  VACANT: "bg-yellow-400",
  LISTED: "bg-blue-400",
  UNDER_NOTICE: "bg-orange-400",
  MAINTENANCE: "bg-gray-400",
  OWNER_OCCUPIED: "bg-purple-400",
};

const STATUS_BADGE: Record<string, "green" | "amber" | "blue" | "red" | "gray"> = {
  ACTIVE: "green",
  VACANT: "amber",
  LISTED: "blue",
  UNDER_NOTICE: "amber",
  MAINTENANCE: "gray",
  OWNER_OCCUPIED: "gray",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-300"}`} />
  );
}

function PropertyFormFields({ register, errors }: { register: any; errors: any }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Property Name *</label>
        <input className="form-input" {...register("name")} placeholder="e.g. Riara One" />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>
      <div>
        <label className="form-label">Type *</label>
        <select className="form-input" {...register("type")}>
          <option value="LONGTERM">Long-term Rental</option>
          <option value="AIRBNB">Airbnb / Short-let</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Address</label>
          <input className="form-input" {...register("address")} placeholder="Street address" />
        </div>
        <div>
          <label className="form-label">City</label>
          <input className="form-input" {...register("city")} placeholder="Nairobi" />
        </div>
      </div>
      <div>
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={2} {...register("description")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Mgmt Fee Rate (%)</label>
          <input type="number" step="0.1" className="form-input" {...register("managementFeeRate")} placeholder="10" />
        </div>
        <div>
          <label className="form-label">Mgmt Fee Flat (KSh)</label>
          <input type="number" className="form-input" {...register("managementFeeFlat")} placeholder="6000" />
        </div>
      </div>
      <div>
        <label className="form-label">Default Service Charge (KSh)</label>
        <input type="number" className="form-input" {...register("serviceChargeDefault")} placeholder="5000" />
      </div>
    </div>
  );
}

function UnitFormFields({ register, errors, propertyType }: { register: any; errors: any; propertyType: "AIRBNB" | "LONGTERM" }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Unit Number *</label>
          <input className="form-input" {...register("unitNumber")} placeholder="e.g. 101, A1, G1" />
          {errors.unitNumber && <p className="form-error">{errors.unitNumber.message}</p>}
        </div>
        <div>
          <label className="form-label">Floor</label>
          <input type="number" className="form-input" {...register("floor")} placeholder="1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Type *</label>
          <select className="form-input" {...register("type")}>
            <option value="BEDSITTER">Bedsitter</option>
            <option value="ONE_BED">1 Bedroom</option>
            <option value="TWO_BED">2 Bedroom</option>
            <option value="THREE_BED">3 Bedroom</option>
            <option value="FOUR_BED">4 Bedroom</option>
            <option value="PENTHOUSE">Penthouse</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="form-label">Status *</label>
          <select className="form-input" {...register("status")}>
            <option value="VACANT">Vacant</option>
            <option value="ACTIVE">Occupied</option>
            <option value="LISTED">Listed</option>
            <option value="UNDER_NOTICE">Under Notice</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OWNER_OCCUPIED">Owner Occupied</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {propertyType === "LONGTERM" && (
          <div>
            <label className="form-label">Monthly Rent (KSh)</label>
            <input type="number" className="form-input" {...register("monthlyRent")} placeholder="25000" />
          </div>
        )}
        <div>
          <label className="form-label">Size (sqm)</label>
          <input type="number" step="0.1" className="form-input" {...register("sizeSqm")} placeholder="45" />
        </div>
      </div>

      <div>
        <label className="form-label">Description / Notes</label>
        <textarea className="form-input" rows={2} {...register("description")} placeholder="e.g. Corner unit, recently renovated" />
      </div>
    </div>
  );
}

// ─── Unit Panel ───────────────────────────────────────────────────────────────

interface UnitPanelProps {
  property: Property;
  isManager: boolean;
  onAddUnit: (property: Property) => void;
  onEditUnit: (property: Property, unit: Unit) => void;
  onDeleteUnit: (unit: Unit) => void;
}

function UnitPanel({ property, isManager, onAddUnit, onEditUnit, onDeleteUnit }: UnitPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full pt-3 text-sm font-sans text-gray-500 hover:text-header transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Home size={13} />
          {property._count.units} unit{property._count.units !== 1 ? "s" : ""}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {property.units.length === 0 ? (
            <p className="text-xs text-gray-400 font-sans text-center py-3">No units yet.</p>
          ) : (
            property.units.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 bg-cream rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={u.status} />
                  <span className="font-medium text-header text-sm font-sans">{u.unitNumber}</span>
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {UNIT_TYPE_LABELS[u.type] ?? u.type}
                  </span>
                  <Badge variant={STATUS_BADGE[u.status] ?? "gray"} className="hidden sm:inline-flex text-xs">
                    {UNIT_STATUS_LABELS[u.status] ?? u.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {u.monthlyRent != null && (
                    <span className="font-mono text-xs text-gray-500 hidden md:block">
                      KSh {u.monthlyRent.toLocaleString("en-KE")}
                    </span>
                  )}
                  {isManager && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditUnit(property, u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-white transition-colors"
                        title="Edit unit"
                      >
                        <PencilLine size={13} />
                      </button>
                      <button
                        onClick={() => onDeleteUnit(u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors"
                        title="Delete unit"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {isManager && (
            <button
              onClick={() => onAddUnit(property)}
              className="flex items-center gap-1.5 w-full justify-center text-xs font-sans text-gold hover:text-gold/80 border border-dashed border-gold/30 hover:border-gold/60 rounded-lg py-2 transition-colors mt-1"
            >
              <Plus size={12} />
              Add unit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "MANAGER";

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Property modal
  const [propModalOpen, setPropModalOpen] = useState(false);
  const [editProp, setEditProp] = useState<Property | null>(null);
  const [propSubmitting, setPropSubmitting] = useState(false);

  // Unit modal
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitModalProperty, setUnitModalProperty] = useState<Property | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [unitSubmitting, setUnitSubmitting] = useState(false);

  // Delete unit confirm
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState(false);

  const propForm = useForm<PropertyForm>({
    resolver: zodResolver(propertySchema),
    defaultValues: { type: "LONGTERM", city: "Nairobi" },
  });

  const unitForm = useForm<UnitForm>({
    resolver: zodResolver(unitSchema),
    defaultValues: { type: "ONE_BED", status: "VACANT" },
  });

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = () => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((d) => { setProperties(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Property handlers ────────────────────────────────────────────────────────

  const openAddProperty = () => {
    setEditProp(null);
    propForm.reset({ type: "LONGTERM", city: "Nairobi" });
    setPropModalOpen(true);
  };

  const openEditProperty = (p: Property) => {
    setEditProp(p);
    propForm.reset({
      name: p.name,
      type: p.type,
      address: p.address ?? "",
      city: p.city ?? "Nairobi",
      description: p.description ?? "",
      managementFeeRate: p.managementFeeRate ?? undefined,
      managementFeeFlat: p.managementFeeFlat ?? undefined,
      serviceChargeDefault: p.serviceChargeDefault ?? undefined,
    });
    setPropModalOpen(true);
  };

  const onSaveProperty = async (values: PropertyForm) => {
    setPropSubmitting(true);
    try {
      const url = editProp ? `/api/properties/${editProp.id}` : "/api/properties";
      const method = editProp ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(editProp ? "Property updated" : "Property created");
      setPropModalOpen(false);
      load();
    } catch {
      toast.error("Failed to save property");
    } finally {
      setPropSubmitting(false);
    }
  };

  // ── Unit handlers ────────────────────────────────────────────────────────────

  const openAddUnit = (property: Property) => {
    setUnitModalProperty(property);
    setEditUnit(null);
    unitForm.reset({ type: "ONE_BED", status: "VACANT" });
    setUnitModalOpen(true);
  };

  const openEditUnit = (property: Property, unit: Unit) => {
    setUnitModalProperty(property);
    setEditUnit(unit);
    unitForm.reset({
      unitNumber: unit.unitNumber,
      type: unit.type as UnitForm["type"],
      status: unit.status as UnitForm["status"],
      monthlyRent: unit.monthlyRent ?? undefined,
      floor: unit.floor ?? undefined,
      sizeSqm: unit.sizeSqm ?? undefined,
      description: unit.description ?? "",
    });
    setUnitModalOpen(true);
  };

  const onSaveUnit = async (values: UnitForm) => {
    if (!unitModalProperty) return;
    setUnitSubmitting(true);
    try {
      const url = editUnit ? `/api/units/${editUnit.id}` : "/api/units";
      const method = editUnit ? "PATCH" : "POST";
      const body = editUnit ? values : { ...values, propertyId: unitModalProperty.id };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      toast.success(editUnit ? "Unit updated" : "Unit added");
      setUnitModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save unit");
    } finally {
      setUnitSubmitting(false);
    }
  };

  const confirmDeleteUnit = async () => {
    if (!deleteUnit) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/units/${deleteUnit.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
      toast.success("Unit deleted");
      setDeleteUnit(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete unit");
    } finally {
      setDeleting(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const activeUnits = (units: Unit[]) => units.filter((u) => u.status === "ACTIVE").length;
  const vacantUnits = (units: Unit[]) =>
    units.filter((u) => u.status === "VACANT" || u.status === "LISTED").length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Properties"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      >
        {isManager && (
          <Button size="sm" onClick={openAddProperty}>
            <Plus size={14} className="mr-1" /> Add Property
          </Button>
        )}
      </Header>

      <div className="page-container">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-sans text-sm">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            No properties yet. Add your first property.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {properties.map((p) => (
              <Card key={p.id}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                      <Building2 size={20} className="text-gold" />
                    </div>
                    <div>
                      <h3 className="font-display text-header text-base leading-tight">{p.name}</h3>
                      {(p.address || p.city) && (
                        <p className="text-xs text-gray-400 font-sans mt-0.5">
                          {[p.address, p.city].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={p.type === "AIRBNB" ? "gold" : "blue"}>
                      {p.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                    </Badge>
                    {isManager && (
                      <button
                        onClick={() => openEditProperty(p)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors"
                        title="Edit property"
                      >
                        <PencilLine size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-cream rounded-lg p-2.5 text-center">
                    <p className="text-lg font-mono font-semibold text-header">{p._count.units}</p>
                    <p className="text-xs text-gray-400 font-sans">Total units</p>
                  </div>
                  <div className="bg-cream rounded-lg p-2.5 text-center">
                    <p className="text-lg font-mono font-semibold text-income">{activeUnits(p.units)}</p>
                    <p className="text-xs text-gray-400 font-sans">Occupied</p>
                  </div>
                  <div className="bg-cream rounded-lg p-2.5 text-center">
                    <p className="text-lg font-mono font-semibold text-yellow-500">{vacantUnits(p.units)}</p>
                    <p className="text-xs text-gray-400 font-sans">Vacant</p>
                  </div>
                </div>

                {/* Fee info */}
                {(p.managementFeeRate || p.managementFeeFlat) && (
                  <div className="flex gap-4 text-xs text-gray-400 font-sans mb-1">
                    {p.managementFeeRate && <span>Mgmt fee: {p.managementFeeRate}%</span>}
                    {p.managementFeeFlat && <span>Flat fee: KSh {p.managementFeeFlat.toLocaleString()}</span>}
                    {p.serviceChargeDefault && <span>Service charge: KSh {p.serviceChargeDefault.toLocaleString()}</span>}
                  </div>
                )}

                {/* Owner */}
                {p.owner && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans mb-1">
                    <Users size={12} />
                    <span>Owner: {p.owner.name ?? p.owner.email}</span>
                  </div>
                )}

                {/* Units panel — expandable */}
                <UnitPanel
                  property={p}
                  isManager={isManager}
                  onAddUnit={openAddUnit}
                  onEditUnit={openEditUnit}
                  onDeleteUnit={(u) => setDeleteUnit(u)}
                />
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Property Modal ─────────────────────────────────────────────────────── */}
      <Modal
        open={propModalOpen}
        onClose={() => setPropModalOpen(false)}
        title={editProp ? "Edit Property" : "Add Property"}
      >
        <form onSubmit={propForm.handleSubmit(onSaveProperty)} className="space-y-4">
          <PropertyFormFields register={propForm.register} errors={propForm.formState.errors} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPropModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={propSubmitting}>
              {editProp ? "Save Changes" : "Create Property"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Unit Modal ─────────────────────────────────────────────────────────── */}
      <Modal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        title={
          editUnit
            ? `Edit ${editUnit.unitNumber}`
            : `Add Unit — ${unitModalProperty?.name ?? ""}`
        }
      >
        <form onSubmit={unitForm.handleSubmit(onSaveUnit)} className="space-y-4">
          <UnitFormFields
            register={unitForm.register}
            errors={unitForm.formState.errors}
            propertyType={unitModalProperty?.type ?? "LONGTERM"}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setUnitModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={unitSubmitting}>
              {editUnit ? "Save Changes" : "Add Unit"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Unit Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteUnit}
        title="Delete unit?"
        message={`Are you sure you want to delete unit ${deleteUnit?.unitNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDeleteUnit}
        onClose={() => setDeleteUnit(null)}
      />
    </div>
  );
}
