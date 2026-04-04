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
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";
import {
  ShieldPlus,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  FileText,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  BUILDING: "Building",
  PUBLIC_LIABILITY: "Public Liability",
  CONTENTS: "Contents",
  OTHER: "Other",
};
const TYPE_BADGE: Record<string, "blue" | "amber" | "green" | "gray"> = {
  BUILDING: "blue",
  PUBLIC_LIABILITY: "amber",
  CONTENTS: "green",
  OTHER: "gray",
};
const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  BIANNUALLY: "Bi-annually",
  ANNUALLY: "Annually",
};
const FREQ_MULTIPLIER: Record<string, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  BIANNUALLY: 2,
  ANNUALLY: 1,
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface PolicyDocument {
  id: string;
  policyId: string;
  label: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
}

interface InsurancePolicy {
  id: string;
  propertyId: string;
  type: string;
  typeOther: string | null;
  insurer: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  coverageAmount: number | null;
  brokerName: string | null;
  brokerContact: string | null;
  notes: string | null;
  property: { name: string };
  documentsCount: number;
  documents?: PolicyDocument[];
}

interface Property {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(endDate: string): { label: string; variant: "red" | "amber" | "green" } {
  const days = daysUntil(endDate);
  if (days < 0) return { label: "Expired", variant: "red" };
  if (days <= 60) return { label: "Expiring Soon", variant: "amber" };
  return { label: "Active", variant: "green" };
}

function annualisedPremium(amount: number | null, freq: string | null): number {
  if (!amount || !freq) return 0;
  return amount * (FREQ_MULTIPLIER[freq] ?? 1);
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Blank form ─────────────────────────────────────────────────────────────────

function blankForm() {
  return {
    propertyId: "",
    type: "BUILDING",
    typeOther: "",
    insurer: "",
    policyNumber: "",
    startDate: "",
    endDate: "",
    premiumAmount: "",
    premiumFrequency: "",
    coverageAmount: "",
    brokerName: "",
    brokerContact: "",
    notes: "",
  };
}

// ── Document Panel ────────────────────────────────────────────────────────────

function DocumentPanel({ policyId }: { policyId: string }) {
  const [docs, setDocs] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/insurance/${policyId}/documents`);
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label || file.name);
      const res = await fetch(`/api/insurance/${policyId}/documents`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Upload failed");
      } else {
        toast.success("Document uploaded");
        setLabel("");
        if (fileRef.current) fileRef.current.value = "";
        await loadDocs();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    const res = await fetch(`/api/insurance/${policyId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document deleted");
      setDocs((d) => d.filter((x) => x.id !== docId));
    } else {
      toast.error("Delete failed");
    }
    setDeleteDocId(null);
  }

  if (loading) return <div className="py-4 flex justify-center"><Spinner size="sm" /></div>;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
      <h4 className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Documents</h4>

      {docs.length === 0 && (
        <p className="text-sm text-gray-400 font-sans">No documents uploaded yet.</p>
      )}

      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between gap-2 text-sm font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-gray-400 shrink-0" />
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-gold-dark truncate flex items-center gap-1"
            >
              {doc.label}
              <ExternalLink size={11} />
            </a>
            {doc.fileSize && (
              <span className="text-gray-400 text-xs shrink-0">{formatFileSize(doc.fileSize)}</span>
            )}
          </div>
          <button
            onClick={() => setDeleteDocId(doc.id)}
            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Upload area */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Document label (optional)"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
        />
        <label className="cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-cream rounded-lg text-sm font-sans text-header hover:bg-cream-dark transition-colors">
            {uploading ? <Spinner size="sm" /> : <Upload size={13} />}
            Upload
          </span>
        </label>
      </div>

      <ConfirmDialog
        open={!!deleteDocId}
        title="Delete document"
        message="Are you sure you want to delete this document? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteDocId && handleDelete(deleteDocId)}
        onClose={() => setDeleteDocId(null)}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "USD";
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [expandedDocPanel, setExpandedDocPanel] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<InsurancePolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const propParam = selectedId ? `?propertyId=${selectedId}` : "";
      const [polRes, propRes] = await Promise.all([
        fetch(`/api/insurance${propParam}`),
        fetch("/api/properties"),
      ]);
      if (polRes.ok) setPolicies(await polRes.json());
      if (propRes.ok) setProperties(await propRes.json());
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditPolicy(null);
    setForm(blankForm());
    setModalOpen(true);
  }

  function openEdit(p: InsurancePolicy) {
    setEditPolicy(p);
    setForm({
      propertyId: p.propertyId,
      type: p.type,
      typeOther: p.typeOther ?? "",
      insurer: p.insurer,
      policyNumber: p.policyNumber,
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate.slice(0, 10),
      premiumAmount: p.premiumAmount?.toString() ?? "",
      premiumFrequency: p.premiumFrequency ?? "",
      coverageAmount: p.coverageAmount?.toString() ?? "",
      brokerName: p.brokerName ?? "",
      brokerContact: p.brokerContact ?? "",
      notes: p.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.propertyId || !form.insurer || !form.policyNumber || !form.startDate || !form.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        propertyId: form.propertyId,
        type: form.type,
        typeOther: form.typeOther || null,
        insurer: form.insurer,
        policyNumber: form.policyNumber,
        startDate: form.startDate,
        endDate: form.endDate,
        premiumAmount: form.premiumAmount ? parseFloat(form.premiumAmount) : null,
        premiumFrequency: form.premiumFrequency || null,
        coverageAmount: form.coverageAmount ? parseFloat(form.coverageAmount) : null,
        brokerName: form.brokerName || null,
        brokerContact: form.brokerContact || null,
        notes: form.notes || null,
      };

      const url = editPolicy ? `/api/insurance/${editPolicy.id}` : "/api/insurance";
      const method = editPolicy ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error?.formErrors?.[0] || err.error || "Save failed");
        return;
      }

      toast.success(editPolicy ? "Policy updated" : "Policy created");
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/insurance/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Policy deleted");
      setPolicies((p) => p.filter((x) => x.id !== id));
    } else {
      toast.error("Delete failed");
    }
    setDeleteId(null);
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = policies.filter((p) => {
    if (filterProperty && p.propertyId !== filterProperty) return false;
    if (filterType && p.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.insurer.toLowerCase().includes(q) &&
        !p.policyNumber.toLowerCase().includes(q) &&
        !(p.brokerName ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const totalPolicies = policies.length;
  const activePolicies = policies.filter((p) => daysUntil(p.endDate) > 60).length;
  const expiringSoon = policies.filter((p) => {
    const d = daysUntil(p.endDate);
    return d >= 0 && d <= 60;
  }).length;
  const expired = policies.filter((p) => daysUntil(p.endDate) < 0).length;
  const totalAnnualPremium = policies.reduce(
    (sum, p) => sum + annualisedPremium(p.premiumAmount, p.premiumFrequency),
    0
  );

  // ── Alert banner policies ─────────────────────────────────────────────────

  const alertPolicies = policies.filter((p) => {
    const d = daysUntil(p.endDate);
    return d <= 60;
  });

  return (
    <>
      <Header title="Insurance Policies" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Expiry alert banner */}
        {alertPolicies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-sans font-semibold text-amber-800">
                {alertPolicies.length} {alertPolicies.length === 1 ? "policy requires" : "policies require"} attention
              </p>
              <ul className="mt-1 space-y-0.5">
                {alertPolicies.map((p) => {
                  const days = daysUntil(p.endDate);
                  return (
                    <li key={p.id} className="text-xs font-sans text-amber-700">
                      <span className="font-medium">{p.insurer}</span> ({p.policyNumber}) —{" "}
                      {days < 0
                        ? `expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`
                        : `expires in ${days} day${days !== 1 ? "s" : ""}`}
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
            <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Total Policies</p>
            <p className="text-2xl font-display text-header mt-1">{totalPolicies}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Active</p>
            <p className="text-2xl font-display text-income mt-1">{activePolicies}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Expiring / Expired</p>
            <p className="text-2xl font-display text-expense mt-1">{expiringSoon + expired}</p>
            {expiringSoon > 0 && (
              <p className="text-xs font-sans text-amber-600 mt-0.5">{expiringSoon} expiring soon</p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Total Annual Premium</p>
            <p className="text-lg font-display text-header mt-1">{formatCurrency(totalAnnualPremium, currency)}</p>
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search insurer, policy no..."
            className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
          <Button onClick={openAdd} className="ml-auto flex items-center gap-2">
            <Plus size={15} /> Add Policy
          </Button>
        </div>

        {/* Policy list */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No insurance policies"
            description="Add your first insurance policy to track coverage and renewals."
            action={<Button onClick={openAdd}><Plus size={14} className="mr-1" />Add Policy</Button>}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((policy) => {
              const status = expiryStatus(policy.endDate);
              const docsOpen = expandedDocPanel === policy.id;

              return (
                <Card key={policy.id} className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={TYPE_BADGE[policy.type] ?? "gray"}>
                          {TYPE_LABELS[policy.type] ?? policy.type}
                        </Badge>
                        <span className="font-sans font-semibold text-header">{policy.insurer}</span>
                        <span className="font-mono text-xs text-gray-400">{policy.policyNumber}</span>
                      </div>
                      <p className="text-xs font-sans text-gray-500 mt-0.5">{policy.property.name}</p>
                    </div>
                  </div>

                  {/* Body grid */}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm font-sans">
                    <div>
                      <span className="text-gray-400 text-xs">Coverage</span>
                      <p className="text-header font-medium">
                        {policy.coverageAmount ? formatCurrency(policy.coverageAmount, currency) : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Premium</span>
                      <p className="text-header font-medium">
                        {policy.premiumAmount
                          ? `${formatCurrency(policy.premiumAmount, currency)} / ${FREQ_LABELS[policy.premiumFrequency ?? ""] ?? ""}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Start date</span>
                      <p className="text-header">{formatDate(new Date(policy.startDate))}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">End date</span>
                      <p className="text-header">{formatDate(new Date(policy.endDate))}</p>
                    </div>
                    {(policy.brokerName || policy.brokerContact) && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-xs">Broker</span>
                        <p className="text-header">
                          {[policy.brokerName, policy.brokerContact].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <button
                      onClick={() => setExpandedDocPanel(docsOpen ? null : policy.id)}
                      className="flex items-center gap-1 text-xs font-sans text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream"
                    >
                      <FileText size={12} />
                      {policy.documentsCount} doc{policy.documentsCount !== 1 ? "s" : ""}
                      {docsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => openEdit(policy)}
                        className="flex items-center gap-1 text-xs font-sans text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(policy.id)}
                        className="flex items-center gap-1 text-xs font-sans text-gray-500 hover:text-expense transition-colors px-2 py-1 rounded-md hover:bg-red-50"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Document panel */}
                  {docsOpen && <DocumentPanel policyId={policy.id} />}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editPolicy ? "Edit Insurance Policy" : "Add Insurance Policy"}
        size="xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Property */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
              Property <span className="text-expense">*</span>
            </label>
            <select
              value={form.propertyId}
              onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
              Type <span className="text-expense">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {form.type === "OTHER" && (
              <input
                type="text"
                value={form.typeOther}
                onChange={(e) => setForm((f) => ({ ...f, typeOther: e.target.value }))}
                placeholder="Specify type..."
                className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            )}
          </div>

          {/* Insurer */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
              Insurer <span className="text-expense">*</span>
            </label>
            <input
              type="text"
              value={form.insurer}
              onChange={(e) => setForm((f) => ({ ...f, insurer: e.target.value }))}
              placeholder="e.g. Jubilee Insurance"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>

          {/* Policy Number */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
              Policy Number <span className="text-expense">*</span>
            </label>
            <input
              type="text"
              value={form.policyNumber}
              onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
              placeholder="e.g. POL-2024-001"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Start Date <span className="text-expense">*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                End Date <span className="text-expense">*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>

          {/* Coverage Amount */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
              Coverage Amount
            </label>
            <input
              type="number"
              value={form.coverageAmount}
              onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))}
              placeholder="0"
              min="0"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          </div>

          {/* Premium Amount + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Premium Amount
              </label>
              <input
                type="number"
                value={form.premiumAmount}
                onChange={(e) => setForm((f) => ({ ...f, premiumAmount: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Frequency
              </label>
              <select
                value={form.premiumFrequency}
                onChange={(e) => setForm((f) => ({ ...f, premiumFrequency: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                <option value="">Select...</option>
                {Object.entries(FREQ_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Broker Name / Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Broker Name
              </label>
              <input
                type="text"
                value={form.brokerName}
                onChange={(e) => setForm((f) => ({ ...f, brokerName: e.target.value }))}
                placeholder="Broker name"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Broker Contact
              </label>
              <input
                type="text"
                value={form.brokerContact}
                onChange={(e) => setForm((f) => ({ ...f, brokerContact: e.target.value }))}
                placeholder="+1 555 000 0000"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Additional notes..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editPolicy ? "Save changes" : "Create policy"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete insurance policy"
        message="Are you sure you want to delete this policy? All attached documents will also be removed."
        confirmLabel="Delete"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onClose={() => setDeleteId(null)}
      />
    </>
  );
}
