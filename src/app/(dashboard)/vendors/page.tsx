"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { formatKSh } from "@/lib/currency";
import {
  Building2, Plus, Search, X, Phone, Mail, Edit2, Trash2,
  CheckCircle, XCircle, TrendingUp, Wrench, Package, RepeatIcon,
} from "lucide-react";
import toast from "react-hot-toast";

const CATEGORY_OPTIONS = [
  { value: "CONTRACTOR",       label: "Contractor" },
  { value: "SUPPLIER",         label: "Supplier" },
  { value: "UTILITY_PROVIDER", label: "Utility Provider" },
  { value: "SERVICE_PROVIDER", label: "Service Provider" },
  { value: "CONSULTANT",       label: "Consultant" },
  { value: "OTHER",            label: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(({ value, label }) => [value, label])
);

const CATEGORY_BADGE: Record<string, "blue" | "green" | "amber" | "gold" | "gray" | "red"> = {
  CONTRACTOR:       "blue",
  SUPPLIER:         "green",
  UTILITY_PROVIDER: "amber",
  SERVICE_PROVIDER: "gold",
  CONSULTANT:       "gray",
  OTHER:            "gray",
};

interface Vendor {
  id:             string;
  name:           string;
  category:       string;
  phone:          string | null;
  email:          string | null;
  kraPin:         string | null;
  bankDetails:    string | null;
  notes:          string | null;
  isActive:       boolean;
  createdAt:      string;
  _count: {
    expenses:         number;
    maintenanceJobs:  number;
    assetLogs:        number;
    recurringExpenses:number;
    assets:           number;
  };
}

interface VendorDetail extends Vendor {
  totalSpend:       number;
  currentYearSpend: number;
  expenses: {
    id: string; date: string; category: string; amount: number; description: string | null;
    property: { name: string } | null; unit: { unitNumber: string } | null;
  }[];
  maintenanceJobs: {
    id: string; title: string; status: string; createdAt: string;
    property: { name: string };
  }[];
}

const blankForm = { name: "", category: "OTHER", phone: "", email: "", kraPin: "", bankDetails: "", notes: "" };

export default function VendorsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [vendors, setVendors]           = useState<Vendor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Vendor | null>(null);
  const [form, setForm]             = useState(blankForm);
  const [saving, setSaving]         = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [detailVendor, setDetailVendor]   = useState<VendorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen]       = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleting, setDeleting]         = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/vendors");
      const data = await res.json();
      setVendors(data);
    } catch {
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter((v) => {
      const matchQ =
        !q ||
        v.name.toLowerCase().includes(q) ||
        (v.phone ?? "").includes(q) ||
        (v.email ?? "").toLowerCase().includes(q) ||
        (v.kraPin ?? "").toLowerCase().includes(q);
      const matchCat    = !catFilter    || v.category === catFilter;
      const matchStatus =
        !statusFilter ||
        (statusFilter === "active"   && v.isActive) ||
        (statusFilter === "inactive" && !v.isActive);
      return matchQ && matchCat && matchStatus;
    });
  }, [vendors, search, catFilter, statusFilter]);

  function openAdd() {
    setEditing(null);
    setForm(blankForm);
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({
      name:        v.name,
      category:    v.category,
      phone:       v.phone ?? "",
      email:       v.email ?? "",
      kraPin:      v.kraPin ?? "",
      bankDetails: v.bankDetails ?? "",
      notes:       v.notes ?? "",
    });
    setFormErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email";
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setSaving(true);
    try {
      const url    = editing ? `/api/vendors/${editing.id}` : "/api/vendors";
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        form.name.trim(),
          category:    form.category,
          phone:       form.phone || null,
          email:       form.email || null,
          kraPin:      form.kraPin || null,
          bankDetails: form.bankDetails || null,
          notes:       form.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to save");
        return;
      }
      const saved: Vendor = await res.json();
      if (editing) {
        setVendors((prev) => prev.map((v) => (v.id === saved.id ? saved : v)));
        toast.success("Vendor updated");
      } else {
        setVendors((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Vendor created");
      }
      setModalOpen(false);
    } catch {
      toast.error("Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(v: Vendor) {
    try {
      const res = await fetch(`/api/vendors/${v.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isActive: !v.isActive }),
      });
      if (!res.ok) { toast.error("Failed to update"); return; }
      const updated: Vendor = await res.json();
      setVendors((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(updated.isActive ? "Vendor activated" : "Vendor deactivated");
    } catch {
      toast.error("Failed to update vendor");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${deleteTarget.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        toast.error(`Cannot delete — ${data.linkedCount} linked record(s). Deactivate instead.`);
        setDeleteTarget(null);
        return;
      }
      if (!res.ok) { toast.error("Failed to delete"); return; }
      setVendors((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      toast.success("Vendor deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete vendor");
    } finally {
      setDeleting(false);
    }
  }

  async function openDetail(v: Vendor) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/vendors/${v.id}`);
      const data = await res.json();
      setDetailVendor(data);
    } catch {
      toast.error("Failed to load vendor details");
    } finally {
      setDetailLoading(false);
    }
  }

  const activeFilters = [
    catFilter && `Category: ${CATEGORY_LABELS[catFilter] ?? catFilter}`,
    statusFilter && `Status: ${statusFilter === "active" ? "Active" : "Inactive"}`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <Header title="Vendor Registry" userName={user?.name} role={user?.role} />
      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* Toolbar */}
        <Card padding="sm">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, phone, email, KRA PIN…"
                  className="w-full pl-8 pr-8 py-2 text-sm font-sans border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <Button onClick={openAdd} size="sm" className="shrink-0">
                <Plus size={14} className="mr-1.5" /> Add Vendor
              </Button>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map((f) => (
                  <span key={f} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold/10 text-gold border border-gold/20">
                    {f}
                  </span>
                ))}
                <button
                  onClick={() => { setCatFilter(""); setStatusFilter(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Summary bar */}
        {!loading && vendors.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total vendors",   value: vendors.length,                          icon: Building2 },
              { label: "Active",          value: vendors.filter((v) => v.isActive).length, icon: CheckCircle },
              { label: "Showing",         value: filtered.length,                          icon: Search },
              { label: "With expenses",   value: vendors.filter((v) => v._count.expenses > 0).length, icon: TrendingUp },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} padding="sm">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-gold shrink-0" />
                  <div>
                    <div className="text-lg font-display text-header">{value}</div>
                    <div className="text-xs text-gray-500 font-sans">{label}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={40} className="text-gray-300" />}
            title="No vendors found"
            description={search || catFilter || statusFilter ? "Try adjusting your search or filters." : "Add your first vendor to start tracking service providers and contractors."}
            action={!search && !catFilter && !statusFilter ? <Button variant="gold" size="sm" onClick={openAdd}><Plus size={14} /> Add Vendor</Button> : undefined}
          />
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Vendor</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden lg:table-cell">KRA PIN</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Usage</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((v) => {
                    const totalUsage =
                      v._count.expenses + v._count.maintenanceJobs +
                      v._count.assetLogs + v._count.recurringExpenses + v._count.assets;
                    return (
                      <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openDetail(v)}
                            className="text-left group"
                          >
                            <div className="font-medium text-gray-900 group-hover:text-gold transition-colors">
                              {v.name}
                            </div>
                            {v.notes && (
                              <div className="text-xs text-gray-400 truncate max-w-48">{v.notes}</div>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Badge variant={CATEGORY_BADGE[v.category] ?? "gray"}>
                            {CATEGORY_LABELS[v.category] ?? v.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="space-y-0.5">
                            {v.phone && (
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <Phone size={11} className="text-gray-400" />{v.phone}
                              </div>
                            )}
                            {v.email && (
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <Mail size={11} className="text-gray-400" />
                                <span className="truncate max-w-40">{v.email}</span>
                              </div>
                            )}
                            {!v.phone && !v.email && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-600">
                          {v.kraPin ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                            {v._count.expenses > 0 && (
                              <span title="Expenses" className="flex items-center gap-0.5">
                                <TrendingUp size={10} className="text-expense" />{v._count.expenses}
                              </span>
                            )}
                            {v._count.maintenanceJobs > 0 && (
                              <span title="Maintenance" className="flex items-center gap-0.5">
                                <Wrench size={10} className="text-gold" />{v._count.maintenanceJobs}
                              </span>
                            )}
                            {v._count.assets > 0 && (
                              <span title="Assets" className="flex items-center gap-0.5">
                                <Package size={10} className="text-blue-400" />{v._count.assets}
                              </span>
                            )}
                            {v._count.recurringExpenses > 0 && (
                              <span title="Recurring" className="flex items-center gap-0.5">
                                <RepeatIcon size={10} className="text-gray-400" />{v._count.recurringExpenses}
                              </span>
                            )}
                            {totalUsage === 0 && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={v.isActive ? "green" : "gray"}>
                            {v.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(v)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleToggleActive(v)}
                              className={`p-1.5 rounded-lg transition-colors ${v.isActive ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-gray-400 hover:text-green-500 hover:bg-green-50"}`}
                              title={v.isActive ? "Deactivate" : "Activate"}
                            >
                              {v.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(v)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Vendor" : "Add Vendor"}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Vendor name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={formErrors.name}
                placeholder="e.g. Nairobi Plumbing Co."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-sans font-medium text-gray-600 mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full text-sm font-sans border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+254 700 000 000"
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={formErrors.email}
              placeholder="vendor@example.com"
            />
            <Input
              label="KRA PIN"
              value={form.kraPin}
              onChange={(e) => setForm((f) => ({ ...f, kraPin: e.target.value }))}
              placeholder="A123456789B"
            />
          </div>
          <div>
            <label className="block text-xs font-sans font-medium text-gray-600 mb-1">Bank Details</label>
            <textarea
              value={form.bankDetails}
              onChange={(e) => setForm((f) => ({ ...f, bankDetails: e.target.value }))}
              rows={2}
              placeholder="Bank name, account number, paybill…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none bg-cream"
            />
          </div>
          <div>
            <label className="block text-xs font-sans font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none bg-cream"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} loading={saving}>
              {editing ? "Save changes" : "Create vendor"}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailVendor(null); }}
        title={detailVendor?.name ?? "Vendor Details"}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : detailVendor ? (
          <div className="space-y-5">
            {/* Info row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Category",    value: CATEGORY_LABELS[detailVendor.category] ?? detailVendor.category },
                { label: "Phone",       value: detailVendor.phone },
                { label: "Email",       value: detailVendor.email },
                { label: "KRA PIN",     value: detailVendor.kraPin },
                { label: "Total spend", value: formatKSh(detailVendor.totalSpend) },
                { label: `${new Date().getFullYear()} spend`, value: formatKSh(detailVendor.currentYearSpend) },
              ].map(({ label, value }) => value ? (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-sm font-medium text-gray-900 truncate">{value}</div>
                </div>
              ) : null)}
            </div>

            {detailVendor.bankDetails && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Bank Details</div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{detailVendor.bankDetails}</div>
              </div>
            )}

            {/* Recent expenses */}
            {detailVendor.expenses.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Recent Expenses</div>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs font-sans">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Description</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Property</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailVendor.expenses.map((e) => (
                        <tr key={e.id}>
                          <td className="px-3 py-2 text-gray-600">
                            {new Date(e.date).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{e.description ?? e.category}</td>
                          <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                            {e.property?.name}{e.unit ? ` · ${e.unit.unitNumber}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-expense font-medium">{formatKSh(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent maintenance jobs */}
            {detailVendor.maintenanceJobs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Recent Maintenance Jobs</div>
                <div className="space-y-1.5">
                  {detailVendor.maintenanceJobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs font-sans">
                      <div className="text-gray-700">{j.title}</div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span>{j.property.name}</span>
                        <Badge variant={j.status === "DONE" ? "green" : j.status === "CANCELLED" ? "gray" : "amber"}>
                          {j.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete vendor"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone. If the vendor has linked records you will need to deactivate it instead.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
