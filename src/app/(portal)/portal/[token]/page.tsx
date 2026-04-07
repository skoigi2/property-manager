"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { format, addMonths, setDate } from "date-fns";
import toast from "react-hot-toast";

type Invoice = {
  id: string;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  rentAmount: number;
  serviceCharge: number;
  otherCharges: number;
  totalAmount: number;
  dueDate: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  paidAt: string | null;
  paidAmount: number | null;
};

type PortalData = {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    monthlyRent: number;
    serviceCharge: number;
    leaseStart: string;
    leaseEnd: string | null;
    rentDueDay: number;
    depositAmount: number;
  };
  unit: { unitNumber: string; type: string };
  property: {
    name: string;
    address: string | null;
    city: string | null;
    logoUrl: string | null;
    currency: string;
  };
  organization: { name: string; logoUrl: string | null } | null;
  invoices: Invoice[];
  outstandingBalance: number;
};

type Tab = "overview" | "documents" | "request";

type Doc = {
  id: string;
  label: string | null;
  category: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  uploadedAt: string;
  url: string | null;
};

type MaintenanceRequest = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "AWAITING_PARTS" | "DONE" | "CANCELLED";
  priority: string;
  isEmergency: boolean;
  reportedDate: string;
  scheduledDate: string | null;
  completedDate: string | null;
  notes: string | null;
};

const REQUEST_STATUS: Record<MaintenanceRequest["status"], { label: string; bg: string; text: string }> = {
  OPEN:           { label: "Open",           bg: "bg-red-100",    text: "text-red-700"    },
  IN_PROGRESS:    { label: "In Progress",    bg: "bg-amber-100",  text: "text-amber-700"  },
  AWAITING_PARTS: { label: "Awaiting Parts", bg: "bg-blue-100",   text: "text-blue-700"   },
  DONE:           { label: "Completed",      bg: "bg-green-100",  text: "text-green-700"  },
  CANCELLED:      { label: "Cancelled",      bg: "bg-gray-100",   text: "text-gray-500"   },
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const CATEGORIES = [
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "STRUCTURAL", label: "Structural" },
  { value: "APPLIANCE", label: "Appliance" },
  { value: "PAINTING", label: "Painting" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "SECURITY", label: "Security" },
  { value: "PEST_CONTROL", label: "Pest Control" },
  { value: "OTHER", label: "Other" },
];

const STATUS_STYLES: Record<Invoice["status"], { bg: string; text: string; label: string }> = {
  DRAFT:     { bg: "bg-gray-100",   text: "text-gray-600",  label: "Draft" },
  SENT:      { bg: "bg-blue-100",   text: "text-blue-700",  label: "Due" },
  PAID:      { bg: "bg-green-100",  text: "text-green-700", label: "Paid" },
  OVERDUE:   { bg: "bg-red-100",    text: "text-red-700",   label: "Overdue" },
  CANCELLED: { bg: "bg-gray-100",   text: "text-gray-500",  label: "Cancelled" },
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    LEASE_AGREEMENT: "Lease Agreement",
    ID_COPY: "ID Copy",
    TAX_ID: "Tax ID",
    PAYMENT_RECEIPT: "Payment Receipt",
    RENEWAL_NOTICE: "Renewal Notice",
    CORRESPONDENCE: "Correspondence",
    OTHER: "Other",
  };
  return map[cat] ?? cat;
}

export default function PortalPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);

  // Maintenance requests
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Maintenance form
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "OTHER",
    isEmergency: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${params.token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) setInvalid(true);
        else setData(d);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [params.token]);

  useEffect(() => {
    if (tab !== "documents" || docs.length > 0) return;
    setDocsLoading(true);
    fetch(`/api/portal/${params.token}/documents`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocs)
      .finally(() => setDocsLoading(false));
  }, [tab, params.token, docs.length]);

  function loadRequests() {
    setRequestsLoading(true);
    fetch(`/api/portal/${params.token}/maintenance`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .finally(() => setRequestsLoading(false));
  }

  useEffect(() => {
    if (tab !== "request") return;
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, params.token]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/portal/${params.token}/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.ok) {
      const newJob: MaintenanceRequest = await res.json();
      setRequests((prev) => [newJob, ...prev]);
      setSubmitted(true);
      setForm({ title: "", description: "", category: "OTHER", isEmergency: false });
      toast.success("Request submitted successfully");
    } else {
      toast.error("Failed to submit request. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (invalid || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link invalid or expired</h1>
          <p className="text-gray-500 text-sm">
            This link is no longer active. Please contact your property manager for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { tenant, unit, property, organization, invoices, outstandingBalance } = data;
  const currency = property.currency;
  const orgName = organization?.name ?? property.name;
  const orgLogo = organization?.logoUrl ?? property.logoUrl;

  // Compute next due date
  const today = new Date();
  let nextDue = setDate(today, tenant.rentDueDay);
  if (nextDue < today) nextDue = setDate(addMonths(today, 1), tenant.rentDueDay);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {orgLogo ? (
            <img src={orgLogo} alt={orgName} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-gray-900 flex items-center justify-center text-white font-semibold text-sm">
              {orgName.charAt(0)}
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-900 text-sm leading-tight">{orgName}</div>
            <div className="text-gray-500 text-xs">Unit {unit.unitNumber}</div>
          </div>
        </div>
      </div>

      {/* Tenant greeting */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <p className="text-gray-500 text-xs uppercase tracking-wide font-medium">Tenant Portal</p>
          <h1 className="text-lg font-semibold text-gray-900">{tenant.name}</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="max-w-lg mx-auto flex gap-0">
          {(["overview", "documents", "request"] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = {
              overview: "Overview",
              documents: "Documents",
              request: "Request",
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
            {/* Balance card */}
            <div className={`rounded-xl p-5 ${outstandingBalance > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                Outstanding Balance
              </p>
              <p className={`text-3xl font-bold ${outstandingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(outstandingBalance, currency)}
              </p>
              {outstandingBalance === 0 && (
                <p className="text-green-600 text-sm mt-1">All paid up ✓</p>
              )}
            </div>

            {/* Lease summary */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Monthly Rent</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(tenant.monthlyRent, currency)}
                </span>
              </div>
              {tenant.serviceCharge > 0 && (
                <div className="px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-500">Service Charge</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(tenant.serviceCharge, currency)}
                  </span>
                </div>
              )}
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Next Due</span>
                <span className="text-sm font-semibold text-gray-900">
                  {format(nextDue, "d MMM yyyy")}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Lease Start</span>
                <span className="text-sm text-gray-900">
                  {format(new Date(tenant.leaseStart), "d MMM yyyy")}
                </span>
              </div>
              {tenant.leaseEnd && (
                <div className="px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-500">Lease End</span>
                  <span className="text-sm text-gray-900">
                    {format(new Date(tenant.leaseEnd), "d MMM yyyy")}
                  </span>
                </div>
              )}
            </div>

            {/* Invoice history */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Invoice History</h2>
              {invoices.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400 text-sm">
                  No invoices yet
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => {
                    const s = STATUS_STYLES[inv.status];
                    return (
                      <div
                        key={inv.id}
                        className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {MONTH_NAMES[inv.periodMonth - 1]} {inv.periodYear}
                          </div>
                          <div className="text-xs text-gray-400">{inv.invoiceNumber}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                            {s.label}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(inv.totalAmount, currency)}
                          </span>
                          {inv.status !== "DRAFT" && inv.status !== "CANCELLED" && (
                            <a
                              href={`/api/portal/${params.token}/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Documents Tab ── */}
        {tab === "documents" && (
          <>
            <h2 className="text-sm font-semibold text-gray-700">Your Documents</h2>
            {docsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-gray-400 text-sm">
                No documents uploaded yet. Contact your property manager if you need copies.
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {doc.label || doc.fileName}
                      </div>
                      <div className="text-xs text-gray-400">
                        {categoryLabel(doc.category)}
                        {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                        {" · "}{format(new Date(doc.uploadedAt), "d MMM yyyy")}
                      </div>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Submit Request Tab ── */}
        {tab === "request" && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Submit a Maintenance Request</h2>
              <p className="text-sm text-gray-500 mb-4">
                Describe the issue and we&apos;ll get back to you as soon as possible.
              </p>

              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-4 text-center">
                  <div className="text-2xl mb-2">✓</div>
                  <p className="text-green-700 font-medium text-sm">Request submitted!</p>
                  <p className="text-green-600 text-xs mt-1">Your property manager has been notified.</p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-3 text-xs text-green-700 underline"
                  >
                    Submit another request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitRequest} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      What&apos;s the issue? <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      placeholder="e.g. Leaking tap in kitchen"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Additional details
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe the problem in more detail..."
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                    />
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.isEmergency}
                      onChange={(e) => setForm((f) => ({ ...f, isEmergency: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-sm text-gray-700">
                      This is an emergency
                      <span className="text-gray-400 text-xs ml-1">(e.g. water leak, power outage)</span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting || !form.title.trim()}
                    className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
                  >
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                </form>
              )}
            </div>

            {/* My past requests */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">My Requests</h2>
              {requestsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : requests.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400 text-sm">
                  No requests submitted yet
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map((req) => {
                    const s = REQUEST_STATUS[req.status];
                    return (
                      <div key={req.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{req.title}</p>
                          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                            {s.label}
                          </span>
                        </div>
                        {req.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">{req.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          <span>{CATEGORIES.find((c) => c.value === req.category)?.label ?? req.category}</span>
                          <span>Submitted {format(new Date(req.reportedDate), "d MMM yyyy")}</span>
                          {req.isEmergency && (
                            <span className="text-red-500 font-medium">Emergency</span>
                          )}
                          {req.scheduledDate && req.status !== "DONE" && (
                            <span className="text-blue-500">
                              Scheduled {format(new Date(req.scheduledDate), "d MMM")}
                            </span>
                          )}
                          {req.completedDate && (
                            <span className="text-green-600">
                              Completed {format(new Date(req.completedDate), "d MMM yyyy")}
                            </span>
                          )}
                        </div>
                        {req.notes && req.status === "DONE" && (
                          <p className="text-xs text-gray-500 bg-gray-50 rounded px-2.5 py-1.5 italic">
                            {req.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
