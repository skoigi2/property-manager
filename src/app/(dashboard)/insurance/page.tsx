"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
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
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { InsuranceDocuments, type InsuranceDocumentsHandle, type PolicyDocument } from "@/components/insurance/InsuranceDocuments";
import { INSURANCE_DOCUMENT_CATEGORY_LABEL, policyLifecycle, renewalDates } from "@/lib/insurance-documents";
import type { ContentsCoverCheck } from "@/lib/contents-cover";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Receipt,
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
const STATUS_META: Record<string, { label: string; variant: "red" | "amber" | "green" | "blue" }> = {
  expired:  { label: "Expired",       variant: "red" },
  expiring: { label: "Expiring Soon", variant: "amber" },
  upcoming: { label: "Upcoming",      variant: "blue" },
  active:   { label: "Active",        variant: "green" },
};

// ── Types ──────────────────────────────────────────────────────────────────────

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
  property: { name: string; currency: string | null };
  documentsCount: number;
  documentCategories: string[];
  contentsCheck: ContentsCoverCheck | null;
}

interface Property {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function annualisedPremium(amount: number | null, freq: string | null): number {
  if (!amount || !freq) return 0;
  return amount * (FREQ_MULTIPLIER[freq] ?? 1);
}

function typeLabel(p: { type: string; typeOther: string | null }): string {
  if (p.type === "OTHER" && p.typeOther) return p.typeOther;
  return TYPE_LABELS[p.type] ?? p.type;
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

const inputCls = "w-full text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30";
const selectCls = `${inputCls} bg-white`;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const { data: session } = useSession();
  const { selectedId, currency } = useProperty();
  useFocusScroll();
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [expandedDocPanel, setExpandedDocPanel] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<InsurancePolicy | null>(null);
  const [renewingFrom, setRenewingFrom] = useState<InsurancePolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());
  const docsRef = useRef<InsuranceDocumentsHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const propParam = selectedId ? `?propertyId=${selectedId}` : "";
      const [polRes, propRes] = await Promise.all([
        fetch(`/api/insurance${propParam}`),
        fetch("/api/properties?minimal=true"),
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
    setRenewingFrom(null);
    setForm({ ...blankForm(), propertyId: selectedId ?? "" });
    setModalOpen(true);
  }

  function openEdit(p: InsurancePolicy) {
    setEditPolicy(p);
    setRenewingFrom(null);
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

  /** Renew = a new policy for the next term with the same cover, so the expired one stays on record. */
  function openRenew(p: InsurancePolicy) {
    const dates = renewalDates(p.startDate, p.endDate);
    setEditPolicy(null);
    setRenewingFrom(p);
    setForm({
      propertyId: p.propertyId,
      type: p.type,
      typeOther: p.typeOther ?? "",
      insurer: p.insurer,
      policyNumber: "",
      startDate: dates.startDate,
      endDate: dates.endDate,
      premiumAmount: p.premiumAmount?.toString() ?? "",
      premiumFrequency: p.premiumFrequency ?? "",
      coverageAmount: p.coverageAmount?.toString() ?? "",
      brokerName: p.brokerName ?? "",
      brokerContact: p.brokerContact ?? "",
      notes: "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (!editPolicy && docsRef.current?.hasQueued() && !window.confirm("Files you added have not been uploaded yet. Discard them?")) return;
    setModalOpen(false);
  }

  async function handleSave() {
    if (!form.propertyId || !form.insurer.trim() || !form.policyNumber.trim() || !form.startDate || !form.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast.error("End date must be after the start date");
      return;
    }
    if (form.premiumAmount && !form.premiumFrequency) {
      toast.error("Pick how often the premium is paid");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        propertyId: form.propertyId,
        type: form.type,
        typeOther: form.typeOther || null,
        insurer: form.insurer.trim(),
        policyNumber: form.policyNumber.trim(),
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

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof body.error === "string" ? body.error : body.error?.formErrors?.[0] || "Save failed";
        toast.error(msg);
        return;
      }

      if (editPolicy) {
        toast.success("Policy updated");
      } else {
        // New policy: push any files chosen in the form now that it has an id.
        const created = body as InsurancePolicy;
        if (docsRef.current?.hasQueued()) {
          const { done, failed } = await docsRef.current.uploadAllTo(created.id);
          if (failed.length === 0) {
            toast.success(`Policy created · ${done} document${done === 1 ? "" : "s"} attached`);
          } else {
            // Keep the form open on the saved policy so the failed rows keep their Retry button.
            toast.error(`Policy created, but ${failed.length} document${failed.length === 1 ? "" : "s"} failed to upload. Retry below or close to leave them off.`);
            setRenewingFrom(null);
            setEditPolicy(created);
            setExpandedDocPanel(created.id);
            await load();
            return;
          }
        } else {
          toast.success(renewingFrom ? "Renewal recorded" : "Policy created");
        }
        setExpandedDocPanel(created.id);
      }
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

  function onDocsChanged(policyId: string, docs: PolicyDocument[]) {
    setPolicies((list) => list.map((p) => p.id === policyId
      ? { ...p, documentsCount: docs.length, documentCategories: Array.from(new Set(docs.map((d) => d.category))) }
      : p));
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const withStatus = policies.map((p) => ({ p, life: policyLifecycle(p.startDate, p.endDate) }));

  const filtered = withStatus.filter(({ p, life }) => {
    if (filterProperty && p.propertyId !== filterProperty) return false;
    if (filterType && p.type !== filterType) return false;
    if (filterStatus && life.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.insurer.toLowerCase().includes(q) &&
        !p.policyNumber.toLowerCase().includes(q) &&
        !(p.brokerName ?? "").toLowerCase().includes(q) &&
        !(p.typeOther ?? "").toLowerCase().includes(q) &&
        !p.property.name.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const totalPolicies = policies.length;
  const activePolicies = withStatus.filter(({ life }) => life.status === "active" || life.status === "upcoming").length;
  const expiringSoon = withStatus.filter(({ life }) => life.status === "expiring").length;
  const expired = withStatus.filter(({ life }) => life.status === "expired").length;
  const totalAnnualPremium = withStatus
    .filter(({ life }) => life.status !== "expired")
    .reduce((sum, { p }) => sum + annualisedPremium(p.premiumAmount, p.premiumFrequency), 0);
  const underInsured = withStatus.filter(({ p, life }) => life.status !== "expired" && p.contentsCheck?.status === "under").length;
  const missingValuation = withStatus.filter(({ p, life }) =>
    life.status !== "expired" && (p.type === "BUILDING" || p.type === "CONTENTS") && !p.documentCategories.includes("VALUATION_REPORT")).length;

  // ── Alert banner policies ─────────────────────────────────────────────────

  const alertPolicies = withStatus.filter(({ life }) => life.status === "expired" || life.status === "expiring");

  const modalTitle = editPolicy ? "Edit Insurance Policy" : renewingFrom ? `Renew — ${renewingFrom.insurer} ${renewingFrom.policyNumber}` : "Add Insurance Policy";

  return (
    <>
      <Header title="Insurance Policies" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Expiry alert banner */}
        {alertPolicies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-amber-800">
                {alertPolicies.length} {alertPolicies.length === 1 ? "policy requires" : "policies require"} attention
              </p>
              <ul className="mt-1 space-y-0.5">
                {alertPolicies.map(({ p, life }) => (
                  <li key={p.id} className="text-caption text-amber-700 flex items-center gap-2 flex-wrap">
                    <span>
                      <span className="font-medium">{p.insurer}</span> ({p.policyNumber}) —{" "}
                      {life.daysToEnd < 0
                        ? `expired ${Math.abs(life.daysToEnd)} day${Math.abs(life.daysToEnd) !== 1 ? "s" : ""} ago`
                        : life.daysToEnd === 0 ? "expires today" : `expires in ${life.daysToEnd} day${life.daysToEnd !== 1 ? "s" : ""}`}
                    </span>
                    <button onClick={() => openRenew(p)} className="inline-flex items-center gap-1 text-amber-800 underline underline-offset-2 hover:text-amber-900">
                      <RefreshCw size={11} /> Renew
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Total Policies</p>
            <p className="text-h1 text-header mt-1">{totalPolicies}</p>
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Active</p>
            <p className="text-h1 text-income mt-1">{activePolicies}</p>
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Expiring / Expired</p>
            <p className="text-h1 text-expense mt-1">{expiringSoon + expired}</p>
            {expiringSoon > 0 && (
              <p className="text-caption text-amber-600 mt-0.5">{expiringSoon} expiring soon</p>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-label text-gray-500 uppercase ">Annual Premium (current cover)</p>
            <p className="text-h3 text-header mt-1">{formatCurrency(totalAnnualPremium, currency)}</p>
            {missingValuation > 0 && (
              <p className="text-caption text-amber-600 mt-0.5">{missingValuation} {missingValuation === 1 ? "policy has" : "policies have"} no valuation report</p>
            )}
            {underInsured > 0 && (
              <p className="text-caption text-expense mt-0.5">{underInsured} contents {underInsured === 1 ? "policy covers" : "policies cover"} less than the asset register</p>
            )}
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)} className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30">
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30">
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-body border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search insurer, policy no, broker..."
            className="flex-1 min-w-[200px] text-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/30"
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
            title={policies.length === 0 ? "No insurance policies" : "No policies match these filters"}
            description={policies.length === 0 ? "Add your first insurance policy to track coverage, renewals and the paperwork behind them." : "Try clearing the type, status or search filters."}
            action={policies.length === 0 ? <Button onClick={openAdd}><Plus size={14} className="mr-1" />Add Policy</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map(({ p: policy, life }) => {
              const status = STATUS_META[life.status];
              const docsOpen = expandedDocPanel === policy.id;
              const policyCurrency = policy.property.currency ?? currency;
              const premiumExpenseHref = policy.premiumAmount
                ? `/expenses?prefill=insurance&propertyId=${policy.propertyId}&amount=${policy.premiumAmount}&description=${encodeURIComponent(`Insurance premium — ${policy.insurer} ${policy.policyNumber}`)}`
                : null;

              return (
                <div key={policy.id} id={`item-${policy.id}`}>
                <Card className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={TYPE_BADGE[policy.type] ?? "gray"}>{typeLabel(policy)}</Badge>
                        <span className="font-semibold text-header">{policy.insurer}</span>
                        <span className="tabular-nums text-caption text-gray-400">{policy.policyNumber}</span>
                      </div>
                      <p className="text-caption text-gray-500 mt-0.5">{policy.property.name}</p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {/* Body grid */}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-body">
                    <div>
                      <span className="text-gray-400 text-caption">Coverage</span>
                      <p className="text-header font-medium">
                        {policy.coverageAmount ? formatCurrency(policy.coverageAmount, policyCurrency) : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-caption">Premium</span>
                      <p className="text-header font-medium">
                        {policy.premiumAmount
                          ? `${formatCurrency(policy.premiumAmount, policyCurrency)}${policy.premiumFrequency ? ` / ${FREQ_LABELS[policy.premiumFrequency] ?? policy.premiumFrequency}` : ""}`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-caption">Start date</span>
                      <p className="text-header">{formatDate(new Date(policy.startDate))}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-caption">End date</span>
                      <p className="text-header">
                        {formatDate(new Date(policy.endDate))}
                        {life.status !== "expired" && life.status !== "upcoming" && (
                          <span className="text-caption text-gray-400"> · {life.daysToEnd === 0 ? "today" : `${life.daysToEnd} days left`}</span>
                        )}
                      </p>
                    </div>
                    {(policy.brokerName || policy.brokerContact) && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-caption">Broker</span>
                        <p className="text-header">
                          {[policy.brokerName, policy.brokerContact].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    )}
                    {policy.notes && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-caption">Notes</span>
                        <p className="text-header whitespace-pre-wrap">{policy.notes}</p>
                      </div>
                    )}
                    {policy.contentsCheck && life.status !== "expired" && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-caption">Contents cover vs asset register</span>
                        {policy.contentsCheck.status === "no_assets" ? (
                          <p className="text-header">
                            No replacement values on the asset register yet.{" "}
                            <Link href="/assets" className="text-gold hover:text-gold-dark">Add them</Link> to check this cover.
                          </p>
                        ) : policy.contentsCheck.status === "no_cover_figure" ? (
                          <p className="text-header">
                            Assets would cost {formatCurrency(policy.contentsCheck.replacementTotal, policyCurrency)} to replace ({policy.contentsCheck.valuedAssets} valued) — enter the sum insured to compare.
                          </p>
                        ) : policy.contentsCheck.status === "under" ? (
                          <p className="text-expense font-medium">
                            Under-insured by {formatCurrency(policy.contentsCheck.shortfall, policyCurrency)} — the register would cost {formatCurrency(policy.contentsCheck.replacementTotal, policyCurrency)} to replace ({policy.contentsCheck.valuedAssets} asset{policy.contentsCheck.valuedAssets === 1 ? "" : "s"}) against {formatCurrency(policy.coverageAmount ?? 0, policyCurrency)} of cover.
                          </p>
                        ) : (
                          <p className="text-income">
                            Covers the register — {formatCurrency(policy.contentsCheck.replacementTotal, policyCurrency)} to replace ({policy.contentsCheck.valuedAssets} asset{policy.contentsCheck.valuedAssets === 1 ? "" : "s"}){policy.contentsCheck.coverRatio ? `, ${Math.round(policy.contentsCheck.coverRatio * 100)}% covered` : ""}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Paperwork on file */}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {policy.documentCategories.length === 0 ? (
                      <span className="text-caption text-gray-400">No documents on file</span>
                    ) : (
                      policy.documentCategories.map((c) => (
                        <span key={c} className="text-label uppercase font-medium px-1.5 py-0.5 rounded bg-cream text-header border border-cream-dark">
                          {INSURANCE_DOCUMENT_CATEGORY_LABEL[c] ?? c}
                        </span>
                      ))
                    )}
                    {life.status !== "expired" && (policy.type === "BUILDING" || policy.type === "CONTENTS") && !policy.documentCategories.includes("VALUATION_REPORT") && (
                      <span className="text-label uppercase font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title="Upload the valuation the sum insured is based on">
                        No valuation report
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setExpandedDocPanel(docsOpen ? null : policy.id)}
                      className="flex items-center gap-1 text-caption text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream"
                    >
                      <FileText size={12} />
                      {policy.documentsCount} doc{policy.documentsCount !== 1 ? "s" : ""}
                      {docsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {premiumExpenseHref && (
                      <Link href={premiumExpenseHref} className="flex items-center gap-1 text-caption text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream" title="Record a premium payment on the Expenses page">
                        <Receipt size={12} /> Log premium
                      </Link>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {(life.status === "expired" || life.status === "expiring") && (
                        <button
                          onClick={() => openRenew(policy)}
                          className="flex items-center gap-1 text-caption text-gold-dark hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream"
                          title="Record the next term as a new policy"
                        >
                          <RefreshCw size={12} /> Renew
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(policy)}
                        className="flex items-center gap-1 text-caption text-gray-500 hover:text-header transition-colors px-2 py-1 rounded-md hover:bg-cream"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(policy.id)}
                        className="flex items-center gap-1 text-caption text-gray-500 hover:text-expense transition-colors px-2 py-1 rounded-md hover:bg-red-50"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Document panel */}
                  {docsOpen && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <h4 className="text-label font-semibold text-gray-500 uppercase mb-2">Documents</h4>
                      <InsuranceDocuments policyId={policy.id} onChanged={(docs) => onDocsChanged(policy.id, docs)} />
                    </div>
                  )}
                </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit / Renew modal */}
      <Modal open={modalOpen} onClose={closeModal} title={modalTitle} size="xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {renewingFrom && (
            <p className="text-caption text-gray-500 bg-cream rounded-lg px-3 py-2">
              This records the next term as a new policy so the old one stays on file. Enter the new policy number and check the dates and premium.
            </p>
          )}

          {/* Property */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Property <span className="text-expense">*</span>
            </label>
            <select value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))} className={selectCls}>
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">
              Type <span className="text-expense">*</span>
            </label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={selectCls}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {form.type === "OTHER" && (
              <input
                type="text"
                value={form.typeOther}
                onChange={(e) => setForm((f) => ({ ...f, typeOther: e.target.value }))}
                placeholder="Specify type, e.g. Employer's liability"
                className={`mt-2 ${inputCls}`}
              />
            )}
          </div>

          {/* Insurer / Policy number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Insurer <span className="text-expense">*</span>
              </label>
              <input type="text" value={form.insurer} onChange={(e) => setForm((f) => ({ ...f, insurer: e.target.value }))} placeholder="e.g. Jubilee Insurance" className={inputCls} />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Policy Number <span className="text-expense">*</span>
              </label>
              <input type="text" value={form.policyNumber} onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))} placeholder="e.g. POL-2024-001" className={`${inputCls} tabular-nums`} />
            </div>
          </div>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                Start Date <span className="text-expense">*</span>
              </label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">
                End Date <span className="text-expense">*</span>
              </label>
              <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={inputCls} />
            </div>
          </div>

          {/* Coverage Amount */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Coverage Amount <span className="text-gray-400 font-normal">(sum insured)</span></label>
            <input type="number" value={form.coverageAmount} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} placeholder="0" min="0" className={`${inputCls} tabular-nums`} />
          </div>

          {/* Premium Amount + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Premium Amount</label>
              <input type="number" value={form.premiumAmount} onChange={(e) => setForm((f) => ({ ...f, premiumAmount: e.target.value }))} placeholder="0" min="0" className={`${inputCls} tabular-nums`} />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Frequency{form.premiumAmount ? <span className="text-expense"> *</span> : null}</label>
              <select value={form.premiumFrequency} onChange={(e) => setForm((f) => ({ ...f, premiumFrequency: e.target.value }))} className={selectCls}>
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
              <label className="block text-caption font-medium text-gray-500 mb-1">Broker Name</label>
              <input type="text" value={form.brokerName} onChange={(e) => setForm((f) => ({ ...f, brokerName: e.target.value }))} placeholder="Broker name" className={inputCls} />
            </div>
            <div>
              <label className="block text-caption font-medium text-gray-500 mb-1">Broker Contact</label>
              <input type="text" value={form.brokerContact} onChange={(e) => setForm((f) => ({ ...f, brokerContact: e.target.value }))} placeholder="+1 555 000 0000" className={inputCls} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-caption font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Excesses, exclusions, renewal reminders..." className={`${inputCls} resize-none`} />
          </div>

          {/* Documents */}
          <div className="border-t border-gray-100 pt-4">
            <label className="block text-caption font-medium text-gray-500 mb-1">Documents</label>
            <p className="text-caption text-gray-400 mb-2">Policy schedule, certificate, the valuation report the sum insured is based on, insurer assessments, claims and premium receipts.</p>
            {modalOpen && (
              <InsuranceDocuments
                ref={docsRef}
                policyId={editPolicy?.id}
                onChanged={editPolicy ? (docs) => onDocsChanged(editPolicy.id, docs) : undefined}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              {editPolicy ? "Close" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editPolicy ? "Save changes" : renewingFrom ? "Record renewal" : "Create policy"}
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
