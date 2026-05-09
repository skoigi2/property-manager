"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/currency";
import { format, addMonths, setDate } from "date-fns";
import toast from "react-hot-toast";
import PaymentNotificationSheet from "@/components/portal/PaymentNotificationSheet";
import BottomSheet from "@/components/portal/BottomSheet";

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
  status: "DRAFT" | "SENT" | "PENDING_VERIFICATION" | "PAID" | "OVERDUE" | "CANCELLED";
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

type Tab = "overview" | "balance" | "documents" | "messages" | "request";

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

type LedgerEvent =
  | {
      kind: "INVOICE_ISSUED";
      date: string;
      invoiceId: string;
      invoiceNumber: string;
      periodYear: number;
      periodMonth: number;
      amount: number;
      totalAmount: number;
      paidAmount: number;
      status: Invoice["status"];
      proofType: string | null;
    }
  | {
      kind: "PAYMENT_RECEIVED";
      date: string;
      incomeEntryId: string;
      amount: number;
      paymentMethod: string | null;
      invoiceId: string | null;
      invoiceNumber: string | null;
    };

type LedgerData = {
  summary: { totalInvoiced: number; totalPaid: number; outstanding: number };
  events: LedgerEvent[];
  nextCursor: string | null;
};

type ThreadSummary = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  lastMessageAt: string;
  preview: string;
  lastSender: "TENANT" | "MANAGER" | null;
  unreadCount: number;
};

type ThreadDetail = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  messages: { id: string; body: string; sender: "TENANT" | "MANAGER"; createdAt: string }[];
};

const REQUEST_STATUS: Record<MaintenanceRequest["status"], { label: string; bg: string; text: string }> = {
  OPEN:           { label: "Open",           bg: "bg-red-100",    text: "text-red-700"    },
  IN_PROGRESS:    { label: "In Progress",    bg: "bg-amber-100",  text: "text-amber-700"  },
  AWAITING_PARTS: { label: "Awaiting Parts", bg: "bg-blue-100",   text: "text-blue-700"   },
  DONE:           { label: "Completed",      bg: "bg-green-100",  text: "text-green-700"  },
  CANCELLED:      { label: "Cancelled",      bg: "bg-gray-100",   text: "text-gray-500"   },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const MAINT_CATEGORIES = [
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

const MSG_CATEGORIES = [
  { value: "LEASE_QUERY", label: "Lease Query" },
  { value: "PAYMENT_NOTIFICATION", label: "Payment Notification" },
  { value: "PERMISSION_REQUEST", label: "Permission Request" },
  { value: "GENERAL", label: "General" },
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  MPESA: "M-Pesa",
  CASH: "Cash",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 4-bucket grouping for the Document Vault
function docBucket(category: string): "lease" | "receipts" | "id" | "other" {
  switch (category) {
    case "LEASE_AGREEMENT":
    case "RENEWAL_NOTICE":
      return "lease";
    case "PAYMENT_RECEIPT":
      return "receipts";
    case "ID_COPY":
    case "TAX_ID":
      return "id";
    default:
      return "other";
  }
}

function fileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📄";
  return "📎";
}

function invoiceBadge(inv: { status: Invoice["status"]; totalAmount: number; paidAmount: number | null }) {
  const isPartial =
    (inv.status === "SENT" || inv.status === "OVERDUE") &&
    inv.paidAmount != null && inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount;
  if (inv.status === "PAID")     return { bg: "bg-green-100", text: "text-green-700", label: "Paid" };
  if (inv.status === "PENDING_VERIFICATION") return { bg: "bg-amber-100", text: "text-amber-700", label: "Awaiting verification" };
  if (isPartial)                  return { bg: "bg-amber-100", text: "text-amber-700", label: "Partially Paid" };
  if (inv.status === "OVERDUE")  return { bg: "bg-red-100", text: "text-red-700", label: "Overdue" };
  if (inv.status === "SENT")     return { bg: "bg-red-100", text: "text-red-700", label: "Due" };
  if (inv.status === "DRAFT")    return { bg: "bg-gray-100", text: "text-gray-500", label: "Draft" };
  return { bg: "bg-gray-100", text: "text-gray-500", label: "Cancelled" };
}

export default function PortalPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);

  // Maintenance
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [maintForm, setMaintForm] = useState({ title: "", description: "", category: "OTHER", isEmergency: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Ledger
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Proof of payment
  const [proofInvoice, setProofInvoice] = useState<{ id: string; number: string } | null>(null);

  // Messages
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ subject: "", category: "GENERAL", body: "" });

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

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const r = await fetch(`/api/portal/${params.token}/ledger`);
      if (r.ok) setLedger(await r.json());
    } finally {
      setLedgerLoading(false);
    }
  }, [params.token]);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const r = await fetch(`/api/portal/${params.token}/documents`);
      if (r.ok) setDocs(await r.json());
    } finally {
      setDocsLoading(false);
    }
  }, [params.token]);

  useEffect(() => {
    if (tab === "documents" && docs.length === 0) loadDocs();
    if (tab === "balance" && !ledger) loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "request") return;
    setRequestsLoading(true);
    fetch(`/api/portal/${params.token}/maintenance`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRequests(Array.isArray(d) ? d : []))
      .finally(() => setRequestsLoading(false));
  }, [tab, params.token]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const r = await fetch(`/api/portal/${params.token}/messages`);
      if (r.ok) setThreads(await r.json());
    } finally {
      setThreadsLoading(false);
    }
  }, [params.token]);

  useEffect(() => {
    if (tab === "messages") loadThreads();
  }, [tab, loadThreads]);

  async function openThread(id: string) {
    setActiveThreadId(id);
    const r = await fetch(`/api/portal/${params.token}/messages/${id}`);
    if (r.ok) setThreadDetail(await r.json());
  }

  async function sendThreadReply() {
    if (!activeThreadId || !reply.trim()) return;
    const r = await fetch(`/api/portal/${params.token}/messages/${activeThreadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply.trim() }),
    });
    if (r.ok) {
      setReply("");
      await openThread(activeThreadId);
      await loadThreads();
      toast.success("Reply sent");
    } else {
      toast.error("Failed to send reply");
    }
  }

  async function sendNewMessage() {
    if (!composeForm.subject.trim() || !composeForm.body.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    const r = await fetch(`/api/portal/${params.token}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(composeForm),
    });
    if (r.ok) {
      toast.success("Message sent");
      setComposeForm({ subject: "", category: "GENERAL", body: "" });
      setComposeOpen(false);
      await loadThreads();
    } else {
      toast.error("Failed to send message");
    }
  }

  async function handleSubmitMaint(e: React.FormEvent) {
    e.preventDefault();
    if (!maintForm.title.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/portal/${params.token}/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(maintForm),
    });
    setSubmitting(false);
    if (res.ok) {
      const newJob: MaintenanceRequest = await res.json();
      setRequests((prev) => [newJob, ...prev]);
      setSubmitted(true);
      setMaintForm({ title: "", description: "", category: "OTHER", isEmergency: false });
      toast.success("Request submitted");
    } else {
      toast.error("Failed to submit request");
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
  const displayName = property.name;

  const today = new Date();
  let nextDue = setDate(today, tenant.rentDueDay);
  if (nextDue < today) nextDue = setDate(addMonths(today, 1), tenant.rentDueDay);

  const docGroups = {
    lease: docs.filter((d) => docBucket(d.category) === "lease"),
    receipts: docs.filter((d) => docBucket(d.category) === "receipts"),
    id: docs.filter((d) => docBucket(d.category) === "id"),
    other: docs.filter((d) => docBucket(d.category) === "other"),
  };

  const totalUnreadThreads = threads.reduce((s, t) => s + (t.unreadCount > 0 ? 1 : 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {orgLogo ? (
            <div className="h-10 w-20 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shrink-0 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={orgLogo} alt={orgName} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="h-10 w-10 rounded-lg bg-gray-900 flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {orgName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm leading-tight truncate">{displayName}</div>
            <div className="text-gray-500 text-xs truncate">{tenant.name} · Unit {unit.unitNumber}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-2">
        <div className="max-w-lg mx-auto flex gap-0 overflow-x-auto">
          {(["overview", "balance", "documents", "messages", "request"] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = {
              overview: "Overview",
              balance: "Balance",
              documents: "Files",
              messages: "Messages",
              request: "Request",
            };
            const showBadge = t === "messages" && totalUnreadThreads > 0;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative ${
                  tab === t
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {labels[t]}
                {showBadge && (
                  <span className="absolute top-2 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <>
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
                <span className="text-sm text-gray-900">{format(new Date(tenant.leaseStart), "d MMM yyyy")}</span>
              </div>
              {tenant.leaseEnd && (
                <div className="px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-gray-500">Lease End</span>
                  <span className="text-sm text-gray-900">{format(new Date(tenant.leaseEnd), "d MMM yyyy")}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTab("balance")}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400 transition-colors"
              >
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">View</div>
                <div className="text-sm font-semibold text-gray-900">My Balance →</div>
              </button>
              <button
                onClick={() => setTab("messages")}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400 transition-colors"
              >
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Send</div>
                <div className="text-sm font-semibold text-gray-900">Message Manager →</div>
              </button>
            </div>
          </>
        )}

        {/* ── Balance Tab ── */}
        {tab === "balance" && (
          <>
            {ledgerLoading || !ledger ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Invoiced</p>
                    <p className="text-base font-bold text-gray-900">
                      {formatCurrency(ledger.summary.totalInvoiced, currency)}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Paid</p>
                    <p className="text-base font-bold text-green-600">
                      {formatCurrency(ledger.summary.totalPaid, currency)}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border p-3 text-center ${
                      ledger.summary.outstanding > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                    }`}
                  >
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Outstanding</p>
                    <p className={`text-base font-bold ${ledger.summary.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatCurrency(ledger.summary.outstanding, currency)}
                    </p>
                  </div>
                </div>

                <h2 className="text-sm font-semibold text-gray-700 mt-4">Invoices</h2>
                {invoices.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-gray-400 text-sm">
                    No invoices yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv) => {
                      const s = invoiceBadge(inv);
                      const canSubmitProof = inv.status === "SENT" || inv.status === "OVERDUE";
                      return (
                        <div key={inv.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {MONTH_NAMES[inv.periodMonth - 1]} {inv.periodYear}
                              </div>
                              <div className="text-xs text-gray-400">{inv.invoiceNumber}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-gray-900">
                                {formatCurrency(inv.totalAmount, currency)}
                              </div>
                              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                                {s.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
                            {inv.status !== "DRAFT" && inv.status !== "CANCELLED" && (
                              <a
                                href={`/api/portal/${params.token}/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-blue-600 hover:underline font-medium px-2 py-1"
                              >
                                Invoice PDF
                              </a>
                            )}
                            {inv.status === "PAID" && (
                              <a
                                href={`/api/portal/${params.token}/invoices/${inv.id}/receipt`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-green-700 hover:underline font-medium px-2 py-1"
                              >
                                Download Receipt
                              </a>
                            )}
                            {canSubmitProof && (
                              <button
                                onClick={() => setProofInvoice({ id: inv.id, number: inv.invoiceNumber })}
                                className="ml-auto text-xs bg-gray-900 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800"
                              >
                                I've Paid This
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <h2 className="text-sm font-semibold text-gray-700 mt-6">Activity Timeline</h2>
                {ledger.events.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">No activity yet</p>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {ledger.events.map((e, i) => (
                      <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {e.kind === "INVOICE_ISSUED" ? (
                            <>
                              <p className="text-sm text-gray-900">
                                Invoice <span className="font-medium">{e.invoiceNumber}</span> issued
                              </p>
                              <p className="text-xs text-gray-400">
                                {format(new Date(e.date), "d MMM yyyy")} · {MONTH_NAMES[e.periodMonth - 1]} {e.periodYear}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-green-700">
                                Payment received{e.invoiceNumber ? ` for ${e.invoiceNumber}` : ""}
                              </p>
                              <p className="text-xs text-gray-400">
                                {format(new Date(e.date), "d MMM yyyy")}
                                {e.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod}` : ""}
                              </p>
                            </>
                          )}
                        </div>
                        <div className={`text-sm font-semibold shrink-0 ${e.kind === "PAYMENT_RECEIVED" ? "text-green-600" : "text-gray-900"}`}>
                          {e.kind === "PAYMENT_RECEIVED" ? "+" : ""}{formatCurrency(e.amount, currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Documents Tab (Document Vault) ── */}
        {tab === "documents" && (
          <>
            {docsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : docs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-gray-400 text-sm">
                No documents yet. Contact your manager if you need copies.
              </div>
            ) : (
              <>
                {([
                  { key: "lease", title: "Lease Agreements", items: docGroups.lease },
                  { key: "receipts", title: "Payment Receipts", items: docGroups.receipts },
                  { key: "id", title: "Identity Docs", items: docGroups.id },
                  { key: "other", title: "Other", items: docGroups.other },
                ] as const).map((group) =>
                  group.items.length === 0 ? null : (
                    <div key={group.key}>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {group.title}
                      </h2>
                      <div className="space-y-2">
                        {group.items.map((doc) => (
                          <div
                            key={doc.id}
                            className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3"
                          >
                            <div className="text-2xl shrink-0">{fileIcon(doc.mimeType)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {doc.label || doc.fileName}
                              </div>
                              <div className="text-xs text-gray-400">
                                Updated {format(new Date(doc.uploadedAt), "d MMM yyyy")}
                                {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                              </div>
                            </div>
                            {doc.url && (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                              >
                                Download
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </>
        )}

        {/* ── Messages Tab ── */}
        {tab === "messages" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">My Messages</h2>
              <button
                onClick={() => setComposeOpen(true)}
                className="text-xs font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800"
              >
                + New Message
              </button>
            </div>

            {threadsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : threads.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-gray-400 text-sm">
                No messages yet. Tap "New Message" to contact your manager.
              </div>
            ) : (
              <div className="space-y-2">
                {threads.map((t) => {
                  const cat = MSG_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{t.subject}</p>
                        {t.unreadCount > 0 && (
                          <span className="shrink-0 text-xs font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                            {t.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-1">{t.preview}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">{cat}</span>
                        <span className="text-gray-400">
                          {format(new Date(t.lastMessageAt), "d MMM")}
                          {t.status === "RESOLVED" && <span className="ml-2 text-green-600 font-medium">Resolved</span>}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Thread detail bottom sheet */}
            <BottomSheet
              open={!!activeThreadId && !!threadDetail}
              onClose={() => { setActiveThreadId(null); setThreadDetail(null); setReply(""); }}
              title={threadDetail?.subject ?? ""}
            >
              {threadDetail && (
                <>
                  <div className="space-y-3 mb-4 max-h-[55vh] overflow-y-auto">
                    {threadDetail.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.sender === "TENANT" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                            m.sender === "TENANT" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                          <p className={`text-[10px] mt-1 ${m.sender === "TENANT" ? "text-gray-300" : "text-gray-500"}`}>
                            {m.sender === "TENANT" ? "You" : "Manager"} · {format(new Date(m.createdAt), "d MMM, HH:mm")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {threadDetail.status !== "RESOLVED" ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type your reply..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                      />
                      <button
                        onClick={sendThreadReply}
                        disabled={!reply.trim()}
                        className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Send Reply
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center text-sm text-green-700">
                      This thread is resolved.
                    </div>
                  )}
                </>
              )}
            </BottomSheet>

            {/* Compose new */}
            <BottomSheet open={composeOpen} onClose={() => setComposeOpen(false)} title="New Message">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={composeForm.category}
                    onChange={(e) => setComposeForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    {MSG_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g. Lease renewal question"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    rows={5}
                    value={composeForm.body}
                    onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Type your message..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                </div>
                <button
                  onClick={sendNewMessage}
                  className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold hover:bg-gray-800"
                >
                  Send Message
                </button>
              </div>
            </BottomSheet>
          </>
        )}

        {/* ── Request Tab (Maintenance) ── */}
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
                  <button onClick={() => setSubmitted(false)} className="mt-3 text-xs text-green-700 underline">
                    Submit another
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitMaint} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={maintForm.category}
                      onChange={(e) => setMaintForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    >
                      {MAINT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      What&apos;s the issue? <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text" required minLength={3}
                      placeholder="e.g. Leaking tap in kitchen"
                      value={maintForm.title}
                      onChange={(e) => setMaintForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional details</label>
                    <textarea
                      rows={3}
                      value={maintForm.description}
                      onChange={(e) => setMaintForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={maintForm.isEmergency}
                      onChange={(e) => setMaintForm((f) => ({ ...f, isEmergency: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-sm text-gray-700">This is an emergency</span>
                  </label>
                  <button
                    type="submit" disabled={submitting || !maintForm.title.trim()}
                    className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
                  >
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                </form>
              )}
            </div>

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
                          <p className="text-sm font-medium text-gray-900">{req.title}</p>
                          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                            {s.label}
                          </span>
                        </div>
                        {req.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">{req.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          <span>{MAINT_CATEGORIES.find((c) => c.value === req.category)?.label ?? req.category}</span>
                          <span>{format(new Date(req.reportedDate), "d MMM yyyy")}</span>
                          {req.isEmergency && <span className="text-red-500 font-medium">Emergency</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Proof of payment sheet */}
      {proofInvoice && (
        <PaymentNotificationSheet
          open={!!proofInvoice}
          onClose={() => setProofInvoice(null)}
          token={params.token}
          invoiceId={proofInvoice.id}
          invoiceNumber={proofInvoice.number}
          onSubmitted={async () => {
            // refresh ledger + main data so the invoice flips to "Awaiting verification"
            await fetch(`/api/portal/${params.token}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => { if (d) setData(d); });
            await loadLedger();
          }}
        />
      )}
    </div>
  );
}
