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
import { Building2, Plus, Users, PencilLine, ChevronDown, ChevronUp, Trash2, Home, X, TrendingUp, Receipt, DollarSign, ChevronRight, LayoutGrid, List, FileText, PackageOpen, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatDate } from "@/lib/date-utils";
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

type PropertyCategory = "RESIDENTIAL" | "OFFICE" | "INDUSTRIAL" | "RETAIL" | "MIXED_USE" | "OTHER";

interface Property {
  id: string;
  name: string;
  type: "AIRBNB" | "LONGTERM";
  category: PropertyCategory | null;
  categoryOther: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  managementFeeRate: number | null;
  managementFeeFlat: number | null;
  serviceChargeDefault: number | null;
  units: Unit[];
  owner:   { id: string; name: string | null; email: string | null } | null;
  manager: { id: string; name: string | null; email: string | null } | null;
  _count: { units: number };
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  OFFICE:      "Office",
  INDUSTRIAL:  "Industrial",
  RETAIL:      "Retail",
  MIXED_USE:   "Mixed Use",
  OTHER:       "Other",
};

const CATEGORY_BADGE: Record<string, "blue"|"amber"|"gray"|"green"|"gold"|"red"> = {
  RESIDENTIAL: "blue",
  OFFICE:      "gold",
  INDUSTRIAL:  "gray",
  RETAIL:      "green",
  MIXED_USE:   "amber",
  OTHER:       "gray",
};

const propertySchema = z.object({
  name: z.string().min(1, "Name required"),
  type: z.enum(["AIRBNB", "LONGTERM"]),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "OTHER"]).optional(),
  categoryOther: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  ownerId:   z.string().optional(),
  managerId: z.string().optional(),
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

interface OwnerUser { id: string; name: string | null; email: string | null; }

function PropertyFormFields({ register, errors, owners, managers, watchedCategory }: {
  register: any; errors: any; owners: OwnerUser[]; managers: OwnerUser[]; watchedCategory?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Property Name *</label>
        <input className="form-input" {...register("name")} placeholder="e.g. Riara One" />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Billing Type *</label>
          <select className="form-input" {...register("type")}>
            <option value="LONGTERM">Long-term Rental</option>
            <option value="AIRBNB">Airbnb / Short-let</option>
          </select>
        </div>
        <div>
          <label className="form-label">Property Category</label>
          <select className="form-input" {...register("category")}>
            <option value="">— Select category —</option>
            <option value="RESIDENTIAL">Residential</option>
            <option value="OFFICE">Office</option>
            <option value="INDUSTRIAL">Industrial</option>
            <option value="RETAIL">Retail</option>
            <option value="MIXED_USE">Mixed Use</option>
            <option value="OTHER">Other (specify)</option>
          </select>
        </div>
      </div>
      {watchedCategory === "OTHER" && (
        <div>
          <label className="form-label">Specify Category</label>
          <input
            className="form-input"
            {...register("categoryOther")}
            placeholder="e.g. Warehouse, Hotel, Student Housing…"
          />
        </div>
      )}
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
      {owners.length > 0 && (
        <div>
          <label className="form-label">Property Owner</label>
          <select className="form-input" {...register("ownerId")}>
            <option value="">— Unassigned —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name ?? o.email}</option>
            ))}
          </select>
        </div>
      )}
      {managers.length > 0 && (
        <div>
          <label className="form-label">Lead Manager</label>
          <select className="form-input" {...register("managerId")}>
            <option value="">— Unassigned —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
            ))}
          </select>
        </div>
      )}
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
            <option value="LISTED">Listed</option>
            <option value="UNDER_NOTICE">Under Notice</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OWNER_OCCUPIED">Owner Occupied</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">&quot;Occupied&quot; is set automatically when a tenant is assigned.</p>
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

// ─── Property Summary Panel ───────────────────────────────────────────────────

const LEASE_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  OK:       { label: "Active",       color: "text-income" },
  WARNING:  { label: "Expiring",     color: "text-amber-600" },
  CRITICAL: { label: "Expired",      color: "text-expense" },
  TBC:      { label: "TBC",          color: "text-gray-400" },
};

function PropertySummaryPanel({ property, onClose }: { property: Property | null; onClose: () => void }) {
  const now = new Date();
  const [stmt, setStmt]         = useState<any | null>(null);
  const [tenants, setTenants]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!property) return;
    setLoading(true);
    setStmt(null);
    setTenants([]);
    Promise.all([
      fetch(`/api/report/owner-statement?propertyId=${property.id}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
        .then((r) => r.json()),
      fetch("/api/tenants").then((r) => r.json()),
    ]).then(([stmtArr, allTenants]) => {
      setStmt(Array.isArray(stmtArr) ? (stmtArr[0] ?? null) : null);
      const unitIds = new Set(property.units.map((u) => u.id));
      setTenants((Array.isArray(allTenants) ? allTenants : []).filter((t: any) => unitIds.has(t.unitId) && t.isActive));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [property?.id]);

  const isOpen = !!property;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={onClose} />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        {!property ? null : (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-header shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
                  <Building2 size={16} className="text-gold" />
                </div>
                <div>
                  <p className="font-display text-white text-sm leading-tight">{property.name}</p>
                  <p className="text-white/50 text-xs font-sans mt-0.5">
                    {property.category
                      ? `${property.category === "OTHER" && property.categoryOther ? property.categoryOther : CATEGORY_LABELS[property.category]} · `
                      : ""}
                    {property.type === "AIRBNB" ? "Airbnb / Short-let" : "Long-term Rental"}
                    {property.owner && ` · ${property.owner.name ?? property.owner.email}`}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
              ) : (
                <div className="p-5 space-y-5">

                  {/* ── 1. Occupancy ─────────────────────────────────────── */}
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Building2 size={12} /> Unit Status
                    </p>
                    {property.units.length === 0 ? (
                      <p className="text-xs text-gray-400 font-sans">No units added yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {/* Status bar */}
                        <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
                          {property.units.map((u) => (
                            <div key={u.id} className={`flex-1 rounded-sm ${STATUS_COLORS[u.status] ?? "bg-gray-200"}`} title={u.unitNumber} />
                          ))}
                        </div>
                        {/* Unit rows */}
                        {property.units.map((u) => (
                          <div key={u.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <StatusDot status={u.status} />
                              <span className="text-sm font-mono font-medium text-header">{u.unitNumber}</span>
                              <span className="text-xs text-gray-400 font-sans">{UNIT_TYPE_LABELS[u.type] ?? u.type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {u.monthlyRent != null && (
                                <span className="text-xs font-mono text-gray-500">KSh {u.monthlyRent.toLocaleString("en-KE")}</span>
                              )}
                              <Badge variant={STATUS_BADGE[u.status] ?? "gray"}>
                                {UNIT_STATUS_LABELS[u.status] ?? u.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        {/* Summary counts */}
                        <div className="flex gap-3 pt-2 text-xs font-sans text-gray-500">
                          <span className="text-income font-medium">{property.units.filter(u => u.status === "ACTIVE").length} occupied</span>
                          <span>·</span>
                          <span className="text-amber-500 font-medium">{property.units.filter(u => u.status === "VACANT" || u.status === "LISTED").length} vacant</span>
                          <span>·</span>
                          <span>{property.units.length} total</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 2. Current Month Financials ──────────────────────── */}
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <TrendingUp size={12} /> {now.toLocaleString("en-KE", { month: "long" })} {now.getFullYear()} Financials
                    </p>
                    {!stmt ? (
                      <p className="text-xs text-gray-400 font-sans">No financial data for this month.</p>
                    ) : (
                      <div className="space-y-2">
                        {[
                          { label: "Gross Income",    value: stmt.grossIncome,    color: "text-income",  icon: <TrendingUp size={13} /> },
                          { label: "Management Fee",  value: -stmt.managementFee, color: "text-expense", icon: <Receipt size={13} /> },
                          { label: "Expenses",        value: -stmt.totalExpenses, color: "text-expense", icon: <Receipt size={13} /> },
                        ].map((row) => (
                          <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                            <div className="flex items-center gap-2 text-xs text-gray-500 font-sans">
                              <span className={row.color}>{row.icon}</span>
                              {row.label}
                            </div>
                            <span className={`font-mono text-sm font-medium ${row.color}`}>
                              {row.value < 0 ? "-" : ""}KSh {Math.abs(row.value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                          <span className="text-xs font-semibold font-sans text-header flex items-center gap-1.5">
                            <DollarSign size={13} className="text-gold" /> Net Payable to Owner
                          </span>
                          <CurrencyDisplay
                            amount={stmt.netPayable}
                            size="md"
                            className={`font-bold ${stmt.netPayable >= 0 ? "text-income" : "text-expense"}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 3. Active Tenants ────────────────────────────────── */}
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Users size={12} /> Active Tenants ({tenants.length})
                    </p>
                    {tenants.length === 0 ? (
                      <p className="text-xs text-gray-400 font-sans">No active tenants.</p>
                    ) : (
                      <div className="space-y-0">
                        {tenants.map((t: any) => {
                          const leaseEnd = t.leaseEnd ? new Date(t.leaseEnd) : null;
                          const daysLeft = leaseEnd ? Math.ceil((leaseEnd.getTime() - Date.now()) / 86400000) : null;
                          const statusKey = !leaseEnd ? "TBC" : daysLeft! < 0 ? "CRITICAL" : daysLeft! <= 60 ? "WARNING" : "OK";
                          const ls = LEASE_STATUS_BADGE[statusKey];
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0">
                              <div className="min-w-0">
                                <p className="text-sm font-sans font-medium text-header truncate">{t.name}</p>
                                <p className="text-xs text-gray-400 font-sans">
                                  Unit {t.unit?.unitNumber} · KSh {t.monthlyRent.toLocaleString("en-KE")}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-xs font-medium ${ls.color}`}>{ls.label}</p>
                                {leaseEnd && (
                                  <p className="text-xs text-gray-400 font-sans">{formatDate(leaseEnd)}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LayoutMode = "grid" | "table";

// ─── Properties Table ─────────────────────────────────────────────────────────

function PropertiesTable({
  properties,
  isManager,
  onSelect,
  onEdit,
  activeUnits,
  vacantUnits,
}: {
  properties: Property[];
  isManager: boolean;
  onSelect: (p: Property) => void;
  onEdit: (p: Property) => void;
  activeUnits: (units: Property["units"]) => number;
  vacantUnits: (units: Property["units"]) => number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50/60">
          <tr>
            {["Property", "Category", "Type", "Units", "Mgmt Fee", "Owner", "Manager", ""].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 font-sans whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {properties.map((p, i) => {
            const occupied = activeUnits(p.units);
            const vacant   = vacantUnits(p.units);
            const total    = p._count.units;
            const feeText  = p.managementFeeRate
              ? `${p.managementFeeRate}%`
              : p.managementFeeFlat
              ? `KSh ${p.managementFeeFlat.toLocaleString("en-KE")}`
              : "—";

            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className={`cursor-pointer hover:bg-gray-50/60 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}
              >
                {/* Property name + address */}
                <td className="px-4 py-3 min-w-[160px]">
                  <p className="font-sans font-semibold text-header text-sm">{p.name}</p>
                  {(p.address || p.city) && (
                    <p className="text-xs text-gray-400 font-sans mt-0.5 truncate max-w-[200px]">
                      {[p.address, p.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                </td>

                {/* Category */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.category ? (
                    <Badge variant={CATEGORY_BADGE[p.category]}>
                      {p.category === "OTHER" && p.categoryOther ? p.categoryOther : CATEGORY_LABELS[p.category]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>

                {/* Type */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge variant={p.type === "AIRBNB" ? "gold" : "blue"}>
                    {p.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                  </Badge>
                </td>

                {/* Units: total / occupied / vacant */}
                <td className="px-4 py-3 whitespace-nowrap font-mono text-sm">
                  <span className="text-header">{total}</span>
                  <span className="text-gray-300 mx-1">/</span>
                  <span className="text-income">{occupied}</span>
                  <span className="text-gray-300 mx-1">/</span>
                  <span className="text-yellow-500">{vacant}</span>
                </td>

                {/* Mgmt fee */}
                <td className="px-4 py-3 whitespace-nowrap text-sm font-sans text-gray-500">
                  {feeText}
                </td>

                {/* Owner */}
                <td className="px-4 py-3 whitespace-nowrap text-sm font-sans text-gray-600">
                  {p.owner ? (p.owner.name ?? p.owner.email) : <span className="text-gray-300">—</span>}
                </td>

                {/* Manager */}
                <td className="px-4 py-3 whitespace-nowrap text-sm font-sans text-gray-600">
                  {p.manager ? (p.manager.name ?? p.manager.email) : <span className="text-gray-300">—</span>}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    {isManager && (
                      <>
                        <Link
                          href={`/properties/${p.id}/agreement`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors"
                          title="Configure agreement"
                        >
                          <FileText size={14} />
                        </Link>
                        <button
                          onClick={() => onEdit(p)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors"
                          title="Edit property"
                        >
                          <PencilLine size={14} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onSelect(p)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors"
                      title="View summary"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Import Handover Modal ────────────────────────────────────────────────────

interface ImportSummary {
  propertyId: string;
  propertyName: string;
  summary: { units: number; tenants: number; incomeEntries: number; expenseEntries: number; pettyCash: number; ownerInvoices: number; documents: number };
  errors: { sheet: string; row: number; reason: string }[];
}

function ImportHandoverModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file,    setFile]    = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ImportSummary | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!file) { toast.error("Select a ZIP file"); return; }
    setLoading(true);
    setApiError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/handover", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setApiError(data.error ?? "Import failed"); return; }
      setResult(data);
      onImported();
    } catch {
      setApiError("Network error — import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <PackageOpen size={18} className="text-gold shrink-0" />
            <div>
              <h3 className="font-display text-header text-lg">Import from Handover Package</h3>
              <p className="text-xs text-gray-400 font-sans mt-0.5">Restores a property from a .zip handover export</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        {!result ? (
          <>
            {/* File picker */}
            <div>
              <label className="text-xs text-gray-500 font-sans uppercase tracking-wide font-medium block mb-2">
                Handover ZIP file
              </label>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${file ? "border-gold/40 bg-gold/5" : "border-gray-200 hover:border-gold/40"}`}>
                <PackageOpen size={28} className={file ? "text-gold" : "text-gray-300"} />
                <span className="text-sm font-sans text-gray-500">
                  {file ? file.name : "Click to select a .zip handover package"}
                </span>
                {file && <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setApiError(null); }}
                />
              </label>
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2 text-xs text-expense font-sans">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {apiError}
              </div>
            )}

            <p className="text-xs text-gray-400 font-sans">
              Will import: property, units, tenants, income, expenses, petty cash, owner invoices, and tenant documents.
              Management agreement settings must be configured manually after import.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSubmit}
                disabled={loading || !file}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><PackageOpen size={14} /> Import Property</>}
              </button>
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* Success summary */
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-income" />
                <p className="text-sm font-sans font-semibold text-income">{result.propertyName} imported successfully</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-sans text-gray-600">
                {[
                  ["Units",           result.summary.units],
                  ["Tenants",         result.summary.tenants],
                  ["Income entries",  result.summary.incomeEntries],
                  ["Expense entries", result.summary.expenseEntries],
                  ["Petty cash",      result.summary.pettyCash],
                  ["Owner invoices",  result.summary.ownerInvoices],
                  ["Documents",       result.summary.documents],
                ].map(([label, count]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span>{label}</span>
                    <span className="font-mono font-semibold text-header">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-h-36 overflow-y-auto">
                <p className="text-xs font-sans font-semibold text-amber-800 mb-1">{result.errors.length} row(s) skipped:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-amber-700 font-sans">
                    {e.sheet} row {e.row}: {e.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <a
                href={`/properties`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark"
              >
                <Building2 size={14} /> View Properties
              </a>
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "MANAGER" || session?.user?.role === "ADMIN";

  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners]         = useState<OwnerUser[]>([]);
  const [managers, setManagers]     = useState<OwnerUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [layout, setLayout] = useState<LayoutMode>("grid");

  function setLayoutMode(mode: LayoutMode) {
    setLayout(mode);
    localStorage.setItem("properties-layout", mode);
  }

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

  // Import handover
  const [showImport, setShowImport] = useState(false);

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

  useEffect(() => {
    const saved = localStorage.getItem("properties-layout");
    if (saved === "grid" || saved === "table") setLayout(saved);
  }, []);

  useEffect(() => {
    load();
    // Fetch OWNER-role users for the owner dropdown
    fetch("/api/users")
      .then((r) => r.json())
      .then((d: any[]) => {
        setOwners(d.filter((u) => u.role === "OWNER"));
        setManagers(d.filter((u) => u.role === "MANAGER" || u.role === "ACCOUNTANT"));
      })
      .catch(() => {});
  }, []);

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
      category: p.category ?? undefined,
      categoryOther: p.categoryOther ?? "",
      address: p.address ?? "",
      city: p.city ?? "Nairobi",
      description: p.description ?? "",
      ownerId:   p.owner?.id   ?? "",
      managerId: p.manager?.id ?? "",
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
        {properties.length > 0 && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setLayoutMode("grid")}
              className={`p-1.5 rounded-md transition-all ${layout === "grid" ? "bg-white shadow-sm text-header" : "text-gray-400 hover:text-gray-600"}`}
              title="Grid view"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setLayoutMode("table")}
              className={`p-1.5 rounded-md transition-all ${layout === "table" ? "bg-white shadow-sm text-header" : "text-gray-400 hover:text-gray-600"}`}
              title="Table view"
            >
              <List size={15} />
            </button>
          </div>
        )}
        {isManager && (
          <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
            <PackageOpen size={14} className="mr-1" /> Import from Handover
          </Button>
        )}
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
        ) : layout === "table" ? (
          <PropertiesTable
            properties={properties}
            isManager={isManager}
            onSelect={setSelectedProperty}
            onEdit={openEditProperty}
            activeUnits={activeUnits}
            vacantUnits={vacantUnits}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {properties.map((p) => (
              <div key={p.id} className="cursor-pointer" onClick={() => setSelectedProperty(p)}>
              <Card className="hover:shadow-md transition-shadow h-full">
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
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {p.category && (
                      <Badge variant={CATEGORY_BADGE[p.category]}>
                        {p.category === "OTHER" && p.categoryOther
                          ? p.categoryOther
                          : CATEGORY_LABELS[p.category]}
                      </Badge>
                    )}
                    <Badge variant={p.type === "AIRBNB" ? "gold" : "blue"}>
                      {p.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                    </Badge>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedProperty(p); }} className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors" title="View summary">
                      <ChevronRight size={15} />
                    </button>
                    {isManager && (
                      <>
                        <Link
                          href={`/properties/${p.id}/agreement`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors"
                          title="Configure agreement"
                        >
                          <FileText size={15} />
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditProperty(p); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-50 transition-colors"
                          title="Edit property"
                        >
                          <PencilLine size={15} />
                        </button>
                      </>
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
                {/* Lead Manager */}
                {p.manager && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans mb-1">
                    <Users size={12} />
                    <span>Manager: {p.manager.name ?? p.manager.email}</span>
                  </div>
                )}

                {/* Units panel — expandable */}
                <div onClick={(e) => e.stopPropagation()}>
                  <UnitPanel
                    property={p}
                    isManager={isManager}
                    onAddUnit={openAddUnit}
                    onEditUnit={openEditUnit}
                    onDeleteUnit={(u) => setDeleteUnit(u)}
                  />
                </div>
              </Card>
              </div>
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
          <PropertyFormFields register={propForm.register} errors={propForm.formState.errors} owners={owners} managers={managers} watchedCategory={propForm.watch("category")} />
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

      <PropertySummaryPanel property={selectedProperty} onClose={() => setSelectedProperty(null)} />

      {showImport && (
        <ImportHandoverModal
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
