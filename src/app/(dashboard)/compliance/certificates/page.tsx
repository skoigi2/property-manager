"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ShieldCheck, Plus, X, Edit2, Trash2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type CertStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "ONGOING";

interface Cert {
  id: string;
  propertyId: string;
  certificateType: string;
  certificateNumber: string | null;
  issuedBy: string | null;
  issueDate: string;
  expiryDate: string | null;
  notes: string | null;
  status: CertStatus;
  property: { id: string; name: string };
}

const STATUS_CONFIG: Record<CertStatus, { variant: "green" | "amber" | "red" | "blue"; label: string }> = {
  VALID:          { variant: "green",  label: "Valid" },
  EXPIRING_SOON:  { variant: "amber",  label: "Expiring Soon" },
  EXPIRED:        { variant: "red",    label: "Expired" },
  ONGOING:        { variant: "blue",   label: "Ongoing" },
};

const STATUS_FILTERS: { value: CertStatus | "ALL"; label: string }[] = [
  { value: "ALL",          label: "All" },
  { value: "EXPIRED",      label: "Expired" },
  { value: "EXPIRING_SOON", label: "Expiring Soon" },
  { value: "VALID",        label: "Valid" },
  { value: "ONGOING",      label: "Ongoing" },
];

const TYPE_SUGGESTIONS = [
  "Gas Safety Certificate",
  "Electrical Safety Certificate",
  "Energy Performance Certificate (EPC)",
  "Fire Risk Assessment",
  "Legionella Risk Assessment",
  "Landlord License",
  "HMO License",
  "Planning Permission",
  "Building Insurance",
  "Public Liability Insurance",
];

// ── Cert Form Modal ───────────────────────────────────────────────────────────

function CertModal({
  cert,
  properties,
  onSave,
  onClose,
}: {
  cert: Cert | null;
  properties: { id: string; name: string }[];
  onSave: (c: Cert) => void;
  onClose: () => void;
}) {
  const defaultPropertyId = properties[0]?.id ?? "";
  const [form, setForm] = useState({
    propertyId:        cert?.propertyId        ?? defaultPropertyId,
    certificateType:   cert?.certificateType   ?? "",
    certificateNumber: cert?.certificateNumber ?? "",
    issuedBy:          cert?.issuedBy          ?? "",
    issueDate:         cert?.issueDate ? cert.issueDate.slice(0, 10) : "",
    expiryDate:        cert?.expiryDate ? cert.expiryDate.slice(0, 10) : "",
    noExpiry:          !cert?.expiryDate,
    notes:             cert?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.certificateType.trim() || !form.issueDate) return;
    setSaving(true);
    try {
      const url  = cert ? `/api/compliance/certificates/${cert.id}` : "/api/compliance/certificates";
      const method = cert ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId:        form.propertyId,
          certificateType:   form.certificateType.trim(),
          certificateNumber: form.certificateNumber.trim() || null,
          issuedBy:          form.issuedBy.trim() || null,
          issueDate:         form.issueDate,
          expiryDate:        form.noExpiry ? null : (form.expiryDate || null),
          notes:             form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const saved: Cert = await res.json();
      onSave(saved);
      toast.success(cert ? "Certificate updated" : "Certificate added");
    } catch {
      toast.error("Failed to save certificate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="font-display text-lg text-header">
            {cert ? "Edit Certificate" : "Add Certificate"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Property</label>
            <select
              value={form.propertyId}
              onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              required
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Certificate Type <span className="text-red-500">*</span>
            </label>
            <input
              list="cert-type-suggestions"
              type="text"
              required
              value={form.certificateType}
              onChange={(e) => setForm((f) => ({ ...f, certificateType: e.target.value }))}
              placeholder="e.g. Gas Safety Certificate"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <datalist id="cert-type-suggestions">
              {TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Certificate Number</label>
              <input
                type="text"
                value={form.certificateNumber}
                onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
                placeholder="Optional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Issued By</label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))}
                placeholder="Inspector / body"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Issue Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.noExpiry ? "" : form.expiryDate}
                disabled={form.noExpiry}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.noExpiry}
              onChange={(e) => setForm((f) => ({ ...f, noExpiry: e.target.checked, expiryDate: e.target.checked ? "" : f.expiryDate }))}
              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gold/40"
            />
            <span className="text-sm text-gray-600">No expiry (ongoing)</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-sans text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-gold text-white rounded-xl text-sm font-sans font-medium hover:bg-gold-dark transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : (cert ? "Update" : "Add Certificate")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CertificatesPage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();

  const [certs, setCerts]       = useState<Cert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState<CertStatus | "ALL">("ALL");
  const [filterProp, setFilterProp]     = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Cert | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cert | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    const propId = filterProp || selectedId || "";
    if (propId) params.set("propertyId", propId);
    fetch(`/api/compliance/certificates?${params}`)
      .then((r) => r.json())
      .then((d) => setCerts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterProp, selectedId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then((d) => setProperties(Array.isArray(d) ? d : []));
  }, []);

  const visible = filterStatus === "ALL" ? certs : certs.filter((c) => c.status === filterStatus);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/compliance/certificates/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCerts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Certificate deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved(cert: Cert) {
    setCerts((prev) => {
      const existing = prev.findIndex((c) => c.id === cert.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = cert;
        return next;
      }
      return [cert, ...prev];
    });
    setShowModal(false);
    setEditTarget(null);
  }

  const counts = {
    VALID:         certs.filter((c) => c.status === "VALID").length,
    EXPIRING_SOON: certs.filter((c) => c.status === "EXPIRING_SOON").length,
    EXPIRED:       certs.filter((c) => c.status === "EXPIRED").length,
    ONGOING:       certs.filter((c) => c.status === "ONGOING").length,
  };

  return (
    <div>
      <Header
        title="Compliance Certificates"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      >
        <Button onClick={() => { setEditTarget(null); setShowModal(true); }} className="flex items-center gap-1.5">
          <Plus size={14} /> Add Certificate
        </Button>
      </Header>

      <div className="page-container space-y-5">
        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: "Expired",       count: counts.EXPIRED,       variant: "red"   as const },
            { label: "Expiring Soon", count: counts.EXPIRING_SOON, variant: "amber" as const },
            { label: "Valid",         count: counts.VALID,         variant: "green" as const },
            { label: "Ongoing",       count: counts.ONGOING,       variant: "blue"  as const },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-sm font-sans text-gray-600">
              <Badge variant={s.variant}>{s.count}</Badge>
              <span className="text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterProp}
            onChange={(e) => setFilterProp(e.target.value)}
            className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold/30"
          >
            <option value="">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value as CertStatus | "ALL")}
                className={`px-3 py-1.5 text-xs font-sans rounded-lg border transition-colors ${
                  filterStatus === f.value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Certificates list */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={32} className="text-gray-300" />}
            title="No certificates"
            description={filterStatus !== "ALL" ? `No ${STATUS_CONFIG[filterStatus as CertStatus]?.label.toLowerCase()} certificates` : "Add compliance certificates to track their expiry dates"}
            action={
              <Button onClick={() => { setEditTarget(null); setShowModal(true); }}>
                <Plus size={14} className="mr-1" /> Add Certificate
              </Button>
            }
          />
        ) : (
          <Card padding="none">
            <div className="divide-y divide-gray-50">
              {visible.map((cert) => {
                const s = STATUS_CONFIG[cert.status];
                return (
                  <div key={cert.id} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-header font-sans">{cert.certificateType}</p>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 font-sans">{cert.property.name}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 font-sans flex-wrap">
                        {cert.certificateNumber && <span>#{cert.certificateNumber}</span>}
                        {cert.issuedBy && <span>Issued by {cert.issuedBy}</span>}
                        <span>Issued {format(new Date(cert.issueDate), "d MMM yyyy")}</span>
                        {cert.expiryDate ? (
                          <span className={cert.status === "EXPIRED" ? "text-red-500 font-medium" : cert.status === "EXPIRING_SOON" ? "text-amber-600 font-medium" : ""}>
                            Expires {format(new Date(cert.expiryDate), "d MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-blue-500">No expiry</span>
                        )}
                      </div>
                      {cert.notes && <p className="text-xs text-gray-400 italic">{cert.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setEditTarget(cert); setShowModal(true); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(cert)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <CertModal
          cert={editTarget}
          properties={properties}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-display text-lg text-header">Delete Certificate?</h2>
            <p className="text-sm text-gray-500 font-sans">
              Delete <strong>{deleteTarget.certificateType}</strong> for {deleteTarget.property.name}? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-sans text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-sans font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
