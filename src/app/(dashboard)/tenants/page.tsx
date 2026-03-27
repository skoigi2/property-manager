"use client";
import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { tenantSchema, type TenantInput } from "@/lib/validations";
import { getLeaseStatus, daysUntilExpiry, formatDate } from "@/lib/date-utils";
import {
  Plus, AlertTriangle, ChevronRight, Pencil,
  LayoutGrid, List, Search, ArrowUpDown,
  ArrowUp, ArrowDown, X, LogOut, FileDown,
} from "lucide-react";
import { exportTenants } from "@/lib/excel-export";
import { clsx } from "clsx";

// ── Types ──────────────────────────────────────────────────────────────────────

type SortKey = "name" | "rent" | "leaseEnd" | "unit";
type SortDir = "asc" | "desc";
type LayoutMode = "grid" | "table";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDate(val: string | null | undefined): Date | null {
  return val ? new Date(val) : null;
}

function LeaseStatusBadge({ leaseEnd }: { leaseEnd: string | null }) {
  const status = getLeaseStatus(toDate(leaseEnd));
  if (status === "TBC")      return <Badge variant="gray">Lease TBC</Badge>;
  if (status === "CRITICAL") return <Badge variant="red">Expired</Badge>;
  if (status === "WARNING") {
    const days = daysUntilExpiry(toDate(leaseEnd));
    return <Badge variant="amber">Expires {days}d</Badge>;
  }
  return <Badge variant="green">Active</Badge>;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={12} className="text-gray-300 ml-1 inline" />;
  return sortDir === "asc"
    ? <ArrowUp size={12} className="text-gold ml-1 inline" />
    : <ArrowDown size={12} className="text-gold ml-1 inline" />;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();

  // Data
  const [tenants, setTenants]       = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  // Modal
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [submitting, setSubmitting]     = useState(false);

  // Letting fee prompt (shown after new tenant created)
  const [lettingFeePrompt, setLettingFeePrompt] = useState<{ tenantName: string; tenantId: string; unitId: string; amount: number; propertyId: string } | null>(null);
  const [lettingFeeLogging, setLettingFeeLogging] = useState(false);

  // Vacate modal
  const [vacateTarget, setVacateTarget] = useState<any>(null);
  const [vacatedDate, setVacatedDate]   = useState("");
  const [vacateNotes, setVacateNotes]   = useState("");
  const [vacating, setVacating]         = useState(false);

  // Layout (persisted)
  const [layout, setLayout] = useState<LayoutMode>("grid");

  // Filters
  const [search, setSearch]           = useState("");
  const [propFilter, setPropFilter]   = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [leaseFilter, setLeaseFilter] = useState("ALL");

  // Sort (table view)
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<TenantInput>({ resolver: zodResolver(tenantSchema) });

  const allUnits = properties.flatMap((p: any) =>
    (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name }))
  );

  // When adding a new tenant, only show units that are vacant or listed
  const availableUnits = editingTenant
    ? allUnits
    : allUnits.filter((u: any) => u.status === "VACANT" || u.status === "LISTED");

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tenants-layout") as LayoutMode | null;
    if (saved === "grid" || saved === "table") setLayout(saved);
  }, []);

  useEffect(() => {
    const propParam = selectedId ? `?propertyId=${selectedId}` : "";
    Promise.all([
      fetch(`/api/tenants${propParam}`).then((r) => r.json()),
      fetch("/api/properties").then((r) => r.json()),
    ]).then(([t, p]) => {
      setTenants(Array.isArray(t) ? t : []);
      setProperties(Array.isArray(p) ? p : []);
      setLoading(false);
    });
  }, [selectedId]);

  function switchLayout(mode: LayoutMode) {
    setLayout(mode);
    localStorage.setItem("tenants-layout", mode);
  }

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...tenants];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.unit?.unitNumber?.toLowerCase().includes(q) ||
          t.email?.toLowerCase().includes(q)
      );
    }

    // Property
    if (propFilter !== "ALL") {
      list = list.filter((t) => t.unit?.property?.name === propFilter);
    }

    // Active status
    if (statusFilter === "ACTIVE")  list = list.filter((t) => t.isActive);
    if (statusFilter === "VACATED") list = list.filter((t) => !t.isActive);

    // Lease status
    if (leaseFilter !== "ALL") {
      list = list.filter((t) => getLeaseStatus(toDate(t.leaseEnd)) === leaseFilter);
    }

    // Sort
    list.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "name")    { va = a.name ?? ""; vb = b.name ?? ""; }
      if (sortKey === "unit")    { va = a.unit?.unitNumber ?? ""; vb = b.unit?.unitNumber ?? ""; }
      if (sortKey === "rent")    { va = (a.monthlyRent ?? 0) + (a.serviceCharge ?? 0); vb = (b.monthlyRent ?? 0) + (b.serviceCharge ?? 0); }
      if (sortKey === "leaseEnd") {
        va = a.leaseEnd ? new Date(a.leaseEnd).getTime() : Infinity;
        vb = b.leaseEnd ? new Date(b.leaseEnd).getTime() : Infinity;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [tenants, search, propFilter, statusFilter, leaseFilter, sortKey, sortDir]);

  const activeFilters = [
    search && `"${search}"`,
    propFilter !== "ALL" && propFilter,
    statusFilter !== "ALL" && (statusFilter === "ACTIVE" ? "Active" : "Vacated"),
    leaseFilter !== "ALL" && ({ OK: "Active Lease", WARNING: "Expiring Soon", TBC: "Lease TBC", CRITICAL: "Expired" }[leaseFilter]),
  ].filter(Boolean);

  function clearFilters() {
    setSearch("");
    setPropFilter("ALL");
    setStatusFilter("ALL");
    setLeaseFilter("ALL");
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openEdit(tenant: any) {
    setEditingTenant(tenant);
    reset({
      name:          tenant.name,
      email:         tenant.email ?? "",
      phone:         tenant.phone ?? "",
      unitId:        tenant.unitId,
      depositAmount: tenant.depositAmount,
      leaseStart:    tenant.leaseStart?.split("T")[0] ?? "",
      leaseEnd:      tenant.leaseEnd?.split("T")[0] ?? "",
      monthlyRent:   tenant.monthlyRent,
      serviceCharge: tenant.serviceCharge,
      isActive:      tenant.isActive,
    });
    setModalOpen(true);
  }

  function openAdd() {
    setEditingTenant(null);
    reset();
    setModalOpen(true);
  }

  async function onSubmit(data: TenantInput) {
    setSubmitting(true);
    try {
      const url    = editingTenant ? `/api/tenants/${editingTenant.id}` : "/api/tenants";
      const method = editingTenant ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTenants((prev) =>
        editingTenant
          ? prev.map((t) => (t.id === updated.id ? updated : t))
          : [updated, ...prev]
      );
      setModalOpen(false);
      reset();
      toast.success(editingTenant ? "Tenant updated" : "Tenant added");
      // Prompt to log letting fee when a new tenant is created
      if (!editingTenant && updated.monthlyRent) {
        const unit = allUnits.find((u: any) => u.id === updated.unitId);
        const prop = properties.find((p: any) => p.units?.some((u: any) => u.id === updated.unitId));
        if (prop) {
          setLettingFeePrompt({
            tenantName: updated.name,
            tenantId:   updated.id,
            unitId:     updated.unitId,
            amount:     Math.round(updated.monthlyRent * 0.5),
            propertyId: prop.id,
          });
        }
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  function openVacate(tenant: any) {
    setVacateTarget(tenant);
    setVacatedDate(new Date().toISOString().split("T")[0]);
    setVacateNotes("");
  }

  async function confirmVacate() {
    if (!vacateTarget) return;
    setVacating(true);
    try {
      const res = await fetch(`/api/tenants/${vacateTarget.id}/vacate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacatedDate, notes: vacateNotes || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setVacateTarget(null);
      toast.success(`${vacateTarget.name} vacated — unit set to Vacant`);
    } catch {
      toast.error("Failed to vacate tenant");
    } finally {
      setVacating(false);
    }
  }

  // Urgent lease alerts
  const urgentTenants = tenants.filter((t) => {
    const s = getLeaseStatus(toDate(t.leaseEnd));
    return s === "TBC" || s === "CRITICAL" || s === "WARNING";
  });

  // Unique property names for filter dropdown
  const propertyNames = Array.from(
    new Set(tenants.map((t) => t.unit?.property?.name).filter(Boolean))
  ) as string[];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Tenants"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />
      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* Lease alerts banner */}
        {urgentTenants.length > 0 && (
          <Card className="border border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <h3 className="font-sans font-medium text-amber-700 text-sm">
                Lease Attention Required
              </h3>
            </div>
            <div className="space-y-1">
              {urgentTenants.map((t) => (
                <p key={t.id} className="text-sm text-amber-600 font-sans">
                  {t.name} ({t.unit?.unitNumber}):{" "}
                  {getLeaseStatus(toDate(t.leaseEnd)) === "TBC"
                    ? "Lease date TBC"
                    : `expires ${t.leaseEnd ? formatDate(t.leaseEnd) : "unknown"}`}
                </p>
              ))}
            </div>
          </Card>
        )}

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
          {/* Row 1: search + layout toggle + add button */}
          <div className="flex gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or unit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Layout toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 shrink-0">
              <button
                onClick={() => switchLayout("grid")}
                title="Card view"
                className={clsx(
                  "p-2 rounded-md transition-colors",
                  layout === "grid"
                    ? "bg-white shadow-sm text-header"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => switchLayout("table")}
                title="Table view"
                className={clsx(
                  "p-2 rounded-md transition-colors",
                  layout === "table"
                    ? "bg-white shadow-sm text-header"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                <List size={16} />
              </button>
            </div>

            {/* Export */}
            {filtered.length > 0 && (
              <button
                onClick={() => exportTenants(filtered)}
                title="Export to Excel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors shrink-0"
              >
                <FileDown size={13} />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {/* Add tenant */}
            <Button onClick={openAdd} size="sm" variant="gold" className="shrink-0">
              <Plus size={15} />
              <span className="hidden sm:inline">Add Tenant</span>
            </Button>
          </div>

          {/* Row 2: filter dropdowns */}
          <div className="flex flex-wrap gap-2">
            <select
              value={propFilter}
              onChange={(e) => setPropFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white text-gray-600"
            >
              <option value="ALL">All properties</option>
              {propertyNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white text-gray-600"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="VACATED">Vacated</option>
            </select>

            <select
              value={leaseFilter}
              onChange={(e) => setLeaseFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white text-gray-600"
            >
              <option value="ALL">All leases</option>
              <option value="OK">Active lease</option>
              <option value="WARNING">Expiring soon</option>
              <option value="TBC">Lease TBC</option>
              <option value="CRITICAL">Expired</option>
            </select>

            {activeFilters.length > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {activeFilters.map((f) => (
                <span
                  key={String(f)}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold/10 text-gold border border-gold/20"
                >
                  {f}
                </span>
              ))}
              <span className="text-xs text-gray-400 font-sans self-center ml-1">
                {filtered.length} of {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 gap-2">
            <Search size={36} className="opacity-20" />
            <p className="text-sm font-medium font-sans">No tenants match your filters</p>
            <button onClick={clearFilters} className="text-xs text-gold hover:underline font-sans mt-1">
              Clear all filters
            </button>
          </div>
        ) : layout === "grid" ? (
          // ── CARD GRID VIEW ───────────────────────────────────────────────
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((tenant) => {
              const status = getLeaseStatus(toDate(tenant.leaseEnd));
              const monthlyTotal = (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0);
              return (
                <Card
                  key={tenant.id}
                  className={clsx(
                    "relative hover:shadow-md transition-shadow",
                    status === "CRITICAL" && "border border-red-200",
                    status === "TBC"      && "border border-amber-200",
                    status === "WARNING"  && "border border-amber-100",
                    !tenant.isActive      && "opacity-60"
                  )}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-sans font-semibold text-header text-sm leading-tight">
                        {tenant.name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {tenant.unit?.unitNumber} · {tenant.unit?.property?.name}
                      </p>
                    </div>
                    <LeaseStatusBadge leaseEnd={tenant.leaseEnd} />
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <p className="text-xs text-gray-400 font-sans">Rent</p>
                      <CurrencyDisplay amount={tenant.monthlyRent} size="sm" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-sans">Svc Charge</p>
                      <CurrencyDisplay amount={tenant.serviceCharge} size="sm" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-sans">Monthly Total</p>
                      <CurrencyDisplay amount={monthlyTotal} size="sm" className="text-header font-medium" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-sans">Lease End</p>
                      <p className={clsx(
                        "font-sans text-sm",
                        status === "TBC"      && "text-amber-600 font-medium",
                        status === "CRITICAL" && "text-expense font-medium",
                        status === "WARNING"  && "text-amber-500 font-medium",
                      )}>
                        {tenant.leaseEnd ? formatDate(tenant.leaseEnd) : "TBC"}
                      </p>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="flex gap-2 pt-2 border-t border-gray-50 items-center">
                    {!tenant.isActive && (
                      <span className="text-xs text-gray-400 font-sans italic self-center">Vacated</span>
                    )}
                    <button
                      onClick={() => openEdit(tenant)}
                      className="flex items-center gap-1.5 text-xs font-sans text-gray-400 hover:text-header transition-colors"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {tenant.isActive && (
                      <button
                        onClick={() => openVacate(tenant)}
                        className="flex items-center gap-1.5 text-xs font-sans text-gray-400 hover:text-expense transition-colors"
                      >
                        <LogOut size={13} /> Vacate
                      </button>
                    )}
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="flex items-center gap-1 text-xs font-sans text-gold hover:text-gold-dark transition-colors ml-auto"
                    >
                      View Detail <ChevronRight size={13} />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          // ── TABLE VIEW ───────────────────────────────────────────────────
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {/* Sortable: Name */}
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-header select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Tenant <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    {/* Sortable: Unit */}
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-header select-none"
                      onClick={() => toggleSort("unit")}
                    >
                      Unit <SortIcon col="unit" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Property
                    </th>
                    {/* Sortable: Rent */}
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-header select-none"
                      onClick={() => toggleSort("rent")}
                    >
                      Monthly <SortIcon col="rent" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Deposit
                    </th>
                    {/* Sortable: Lease End */}
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-header select-none"
                      onClick={() => toggleSort("leaseEnd")}
                    >
                      Lease End <SortIcon col="leaseEnd" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant, i) => {
                    const status = getLeaseStatus(toDate(tenant.leaseEnd));
                    const monthlyTotal = (tenant.monthlyRent ?? 0) + (tenant.serviceCharge ?? 0);
                    return (
                      <tr
                        key={tenant.id}
                        className={clsx(
                          "border-b border-gray-50 hover:bg-gray-50/60 transition-colors",
                          !tenant.isActive && "opacity-55",
                          i % 2 === 1 && "bg-gray-50/30",
                        )}
                      >
                        {/* Name + email */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-header">{tenant.name}</p>
                          {tenant.email && (
                            <p className="text-xs text-gray-400 font-sans mt-0.5">{tenant.email}</p>
                          )}
                          {tenant.phone && !tenant.email && (
                            <p className="text-xs text-gray-400 font-sans mt-0.5">{tenant.phone}</p>
                          )}
                        </td>
                        {/* Unit */}
                        <td className="px-4 py-3 font-mono text-sm text-gray-600">
                          {tenant.unit?.unitNumber ?? "—"}
                        </td>
                        {/* Property */}
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {tenant.unit?.property?.name ?? "—"}
                        </td>
                        {/* Monthly total */}
                        <td className="px-4 py-3 text-right">
                          <p className="font-mono text-sm font-medium text-header">
                            KSh {monthlyTotal.toLocaleString("en-KE")}
                          </p>
                          <p className="text-xs text-gray-400 font-sans mt-0.5">
                            {tenant.monthlyRent?.toLocaleString("en-KE")} + {tenant.serviceCharge?.toLocaleString("en-KE")}
                          </p>
                        </td>
                        {/* Deposit */}
                        <td className="px-4 py-3 text-center font-mono text-sm text-gray-500">
                          {tenant.depositAmount
                            ? `KSh ${tenant.depositAmount.toLocaleString("en-KE")}`
                            : "—"}
                        </td>
                        {/* Lease end */}
                        <td className="px-4 py-3 text-center">
                          <p className={clsx(
                            "text-sm font-sans",
                            status === "TBC"      && "text-amber-600 font-medium",
                            status === "CRITICAL" && "text-expense font-medium",
                            status === "WARNING"  && "text-amber-500 font-medium",
                            status === "OK"       && "text-gray-500",
                          )}>
                            {tenant.leaseEnd ? formatDate(tenant.leaseEnd) : "TBC"}
                          </p>
                          {status === "WARNING" && (
                            <p className="text-xs text-amber-400 font-sans mt-0.5">
                              {daysUntilExpiry(toDate(tenant.leaseEnd))}d left
                            </p>
                          )}
                        </td>
                        {/* Status badge */}
                        <td className="px-4 py-3 text-center">
                          {tenant.isActive
                            ? <LeaseStatusBadge leaseEnd={tenant.leaseEnd} />
                            : <Badge variant="gray">Vacated</Badge>
                          }
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(tenant)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            {tenant.isActive && (
                              <button
                                onClick={() => openVacate(tenant)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors"
                                title="Vacate tenant"
                              >
                                <LogOut size={14} />
                              </button>
                            )}
                            <Link
                              href={`/tenants/${tenant.id}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                              title="View detail"
                            >
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="border-t border-gray-50 px-4 py-2.5 flex flex-wrap gap-4 text-xs text-gray-400 font-sans">
              <span>
                {filtered.length} tenant{filtered.length !== 1 ? "s" : ""}
                {activeFilters.length > 0 && ` (filtered from ${tenants.length})`}
              </span>
              <span className="ml-auto">
                Total monthly:{" "}
                <strong className="text-gray-600 font-mono">
                  KSh {filtered
                    .filter((t) => t.isActive)
                    .reduce((s, t) => s + (t.monthlyRent ?? 0) + (t.serviceCharge ?? 0), 0)
                    .toLocaleString("en-KE")}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Vacate Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!vacateTarget}
        onClose={() => setVacateTarget(null)}
        title="Vacate Tenant"
        size="sm"
      >
        {vacateTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 font-sans">
              Marking <strong>{vacateTarget.name}</strong> as vacated will set their unit{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{vacateTarget.unit?.unitNumber}</span>{" "}
              to <strong>Vacant</strong>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-sans">Vacated Date</label>
              <input
                type="date"
                value={vacatedDate}
                onChange={(e) => setVacatedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 font-sans">Notes (optional)</label>
              <textarea
                value={vacateNotes}
                onChange={(e) => setVacateNotes(e.target.value)}
                rows={2}
                placeholder="Reason for vacating, condition notes…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={() => setVacateTarget(null)}>Cancel</Button>
              <Button variant="gold" type="button" loading={vacating} onClick={confirmVacate}>
                Confirm Vacate
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); reset(); }}
        title={editingTenant ? "Edit Tenant" : "Add Tenant"}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Tenant Name" {...register("name")} error={errors.name?.message} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" placeholder="tenant@example.com" {...register("email")} error={errors.email?.message} />
            <Input label="Phone" type="tel" placeholder="+254 7XX XXX XXX" {...register("phone")} />
          </div>
          <Select
            label={editingTenant ? "Unit" : "Unit (vacant/listed only)"}
            placeholder="Select unit..."
            {...register("unitId")}
            options={availableUnits.map((u: any) => ({
              value: u.id,
              label: `${u.unitNumber} (${u.propertyName})`,
            }))}
            error={errors.unitId?.message}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Monthly Rent (KSh)"    type="number" prefix="KSh" {...register("monthlyRent")}   error={errors.monthlyRent?.message} />
            <Input label="Service Charge (KSh)"  type="number" prefix="KSh" {...register("serviceCharge")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Deposit (KSh)" type="number" prefix="KSh" {...register("depositAmount")} error={errors.depositAmount?.message} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Lease Start" type="date" {...register("leaseStart")} error={errors.leaseStart?.message} />
            <Input label="Lease End"   type="date" {...register("leaseEnd")} />
          </div>
          <p className="text-xs text-gray-400 font-sans">Leave Lease End blank to mark as TBC</p>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={submitting}>
              {editingTenant ? "Update" : "Add Tenant"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setModalOpen(false); reset(); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Letting Fee Prompt ── */}
      {lettingFeePrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <span className="text-gold font-mono font-bold text-sm">KSh</span>
              </div>
              <div>
                <h3 className="font-display text-header text-base">Generate Letting Fee Invoice?</h3>
                <p className="text-xs text-gray-400 font-sans mt-0.5">New tenancy created for {lettingFeePrompt.tenantName}</p>
              </div>
            </div>
            <p className="text-sm font-sans text-gray-600">
              A letting fee of <span className="font-semibold text-header">KSh {lettingFeePrompt.amount.toLocaleString("en-KE")}</span> (50% of first month&apos;s rent) will be invoiced to the owner. Mark it paid once settled.
            </p>
            <div className="flex gap-3 pt-1">
              <Button
                size="sm"
                loading={lettingFeeLogging}
                onClick={async () => {
                  setLettingFeeLogging(true);
                  try {
                    const now   = new Date();
                    const due   = new Date(now); due.setDate(due.getDate() + 7);
                    await fetch("/api/owner-invoices", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        propertyId:  lettingFeePrompt.propertyId,
                        type:        "LETTING_FEE",
                        periodYear:  now.getFullYear(),
                        periodMonth: now.getMonth() + 1,
                        lineItems: [{
                          description: `Letting fee — ${lettingFeePrompt.tenantName} (50% of first month\u2019s rent)`,
                          amount:      lettingFeePrompt.amount,
                          unitId:      lettingFeePrompt.unitId,
                          tenantId:    lettingFeePrompt.tenantId,
                          incomeType:  "LETTING_FEE",
                        }],
                        dueDate: due.toISOString().split("T")[0],
                        notes: `New tenant: ${lettingFeePrompt.tenantName}`,
                      }),
                    });
                    toast.success(`Letting fee invoice of KSh ${lettingFeePrompt.amount.toLocaleString("en-KE")} generated (DRAFT)`);
                  } catch {
                    toast.error("Failed to log letting fee");
                  } finally {
                    setLettingFeeLogging(false);
                    setLettingFeePrompt(null);
                  }
                }}
              >
                Generate Invoice
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setLettingFeePrompt(null)}>
                Skip
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
