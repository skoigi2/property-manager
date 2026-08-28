"use client";
import { useState, useEffect, useCallback } from "react";
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
import { calcLateInterest } from "@/lib/calculations";
import { getArrearsLetters, type LetterContext, type LetterTemplate } from "@/lib/arrears-letters";
import Link from "next/link";
import { AlertTriangle, ChevronRight, CheckCircle, Plus, Trash2, FileText, Copy, FileDown, TrendingUp, ExternalLink } from "lucide-react";
import { exportArrears } from "@/lib/excel-export";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { clsx } from "clsx";
import { HelpTip } from "@/components/ui/HelpTip";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Arrears is now CaseThread(caseType=ARREARS) — see src/lib/arrears.ts. This
 * page is the list-and-triage view; /cases/[id] is the record, and owns the
 * timeline, comments and attachments rather than duplicating them here.
 */
interface ArrearsCase {
  id: string;
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  phone: string | null;
  email: string | null;
  propertyId: string;
  propertyName: string;
  currency: string;
  status: string;
  stageKey: string;
  stageLabel: string;
  stageIndex: number;
  /** Derived live from unpaid invoices — no longer hand-entered. */
  amountOwed: number;
  oldestAgeDays: number;
  invoiceCount: number;
  lastActivityAt: string;
  stageStartedAt: string | null;
  latePaymentInterestRate: number;
  isResolved: boolean;
}

function accruedInterest(c: ArrearsCase): number {
  const rate = c.latePaymentInterestRate ?? 12;
  if (rate === 0 || c.amountOwed <= 0) return 0;
  // Interest runs from the oldest unpaid invoice, not from when someone
  // happened to open the case.
  return calcLateInterest(c.amountOwed, rate, c.oldestAgeDays);
}

// ── Stage metadata, keyed on ARREARS_V1 stage keys ────────────────────────────

const STAGE_ORDER = [
  "informal_reminder", "formal_notice", "demand_letter",
  "legal_action", "eviction", "settled", "closed",
] as const;

const STAGE_BADGE: Record<string, "amber" | "gold" | "red" | "green" | "gray"> = {
  informal_reminder: "amber",
  formal_notice:     "amber",
  demand_letter:     "gold",
  legal_action:      "red",
  eviction:          "red",
  settled:           "green",
  closed:            "gray",
};

const STAGE_TIPS: Record<string, string> = {
  informal_reminder: "Initial polite contact about the overdue balance. Most cases resolve at this stage.",
  formal_notice:     "Written notice stating the balance and a date to pay by. No threat of action yet.",
  demand_letter:     "Formal demand requiring payment within 7 days, stating that legal action follows. This is the pre-action document.",
  legal_action:      "Proceedings have begun. Seek professional advice before going further.",
  eviction:          "Possession sought. This does not extinguish the outstanding debt.",
  settled:           "The balance was paid or a settlement agreed.",
  closed:            "Closed without settlement — written off, tenant vacated, or otherwise ended.",
};

/** Next stage in the ladder, or null at the end. */
function nextStageKey(stageKey: string): string | null {
  const i = STAGE_ORDER.indexOf(stageKey as typeof STAGE_ORDER[number]);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

function stageLabelFor(key: string): string {
  return key.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function letterContext(c: ArrearsCase): LetterContext {
  return {
    tenantName: c.tenantName,
    unitNumber: c.unitNumber,
    propertyName: c.propertyName,
    amount: formatCurrency(c.amountOwed, c.currency),
    today: formatDate(new Date()),
  };
}

// ── Case card ──────────────────────────────────────────────────────────────────

function CaseCard({ arrearsCase, isManager, onEscalate, onDelete }: {
  arrearsCase: ArrearsCase;
  isManager: boolean;
  onEscalate: (c: ArrearsCase, stageKey: string, notes?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [escNotes, setEscNotes] = useState("");
  const [letterModal, setLetterModal] = useState(false);
  const [letter, setLetter] = useState<LetterTemplate | null>(null);
  const [copied, setCopied] = useState(false);

  const nextKey = arrearsCase.isResolved ? null : nextStageKey(arrearsCase.stageKey);
  // Letters live on the stage that produces them, so a manager can only send
  // the document appropriate to where the case actually is.
  const letters = getArrearsLetters(arrearsCase.stageKey);
  const ctx = letterContext(arrearsCase);
  const letterBody = letter ? letter.body(ctx) : "";

  const copyLetter = () => {
    navigator.clipboard.writeText(letterBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card padding="md" className={arrearsCase.isResolved ? "opacity-60" : ""}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          arrearsCase.isResolved ? "bg-green-50" : "bg-red-50")}>
          {arrearsCase.isResolved
            ? <CheckCircle size={16} className="text-income" />
            : <AlertTriangle size={16} className="text-expense" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-body text-header">{arrearsCase.tenantName}</p>
            <span className="inline-flex items-center gap-1">
              <Badge variant={STAGE_BADGE[arrearsCase.stageKey] ?? "gray"}>{arrearsCase.stageLabel}</Badge>
              <HelpTip text={STAGE_TIPS[arrearsCase.stageKey] ?? ""} />
            </span>
          </div>
          <p className="text-caption text-gray-400 mt-0.5">
            Unit {arrearsCase.unitNumber} · {arrearsCase.propertyName}
            {arrearsCase.invoiceCount > 0 && ` · ${arrearsCase.invoiceCount} unpaid invoice${arrearsCase.invoiceCount === 1 ? "" : "s"}`}
            {` · Last activity ${formatDate(new Date(arrearsCase.lastActivityAt))}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="tabular-nums text-body font-medium text-expense"
            title="Outstanding balance across this tenant's unpaid invoices. Calculated live — settle or credit an invoice to change it."
          >
            {formatCurrency(arrearsCase.amountOwed, arrearsCase.currency)}
          </span>
          {/* Accrued interest */}
          {(() => {
            const interest = accruedInterest(arrearsCase);
            const rate     = arrearsCase.latePaymentInterestRate ?? 12;
            const days     = arrearsCase.oldestAgeDays;
            if (interest <= 0) return null;
            return (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1" title={`${rate}% p.a. × ${days} days`}>
                <TrendingUp size={11} />
                <span className="tabular-nums text-caption font-medium">
                  +{formatCurrency(interest, arrearsCase.currency)}
                </span>
                <span className="text-caption text-amber-500 ">{days}d interest</span>
              </div>
            );
          })()}
          <button onClick={() => setExpanded(e => !e)} className="text-caption text-gray-400 hover:text-gray-600 flex items-center gap-1">
            {expanded ? "Collapse" : "Expand"} <ChevronRight size={12} className={clsx("transition-transform", expanded && "rotate-90")} />
          </button>
        </div>
      </div>

      {/* Detail */}
      {expanded && (
        <div className="mt-4 pl-12 space-y-3">
          {/* Interest detail */}
          {(() => {
            const interest = accruedInterest(arrearsCase);
            const rate     = arrearsCase.latePaymentInterestRate ?? 12;
            const days     = arrearsCase.oldestAgeDays;
            if (interest <= 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-caption text-amber-700">
                <span className="font-medium">Interest accrued: </span>
                {formatCurrency(interest, arrearsCase.currency)}
                <span className="text-amber-500"> · {rate}% p.a. × {days} days on {formatCurrency(arrearsCase.amountOwed, arrearsCase.currency)} outstanding</span>
              </div>
            );
          })()}

          {/* The case record owns the timeline — this page doesn't duplicate it. */}
          <Link
            href={`/cases/${arrearsCase.id}`}
            className="inline-flex items-center gap-1.5 text-caption text-gold hover:underline font-medium"
          >
            <ExternalLink size={12} />
            Full history, notes and attachments
          </Link>

          {/* Letters for this stage */}
          {letters.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {letters.map((l) => (
                <button
                  key={l.key}
                  onClick={() => { setLetter(l); setLetterModal(true); }}
                  title={l.purpose}
                  className="flex items-center gap-1.5 text-caption text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors"
                >
                  <FileText size={12} />
                  {l.title}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          {isManager && !arrearsCase.isResolved && (
            <div className="space-y-2 pt-1">
              <textarea
                value={escNotes}
                onChange={e => setEscNotes(e.target.value)}
                placeholder="Notes for escalation (optional)…"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-caption focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
              />
              <div className="flex items-center gap-2 flex-wrap">
                {nextKey && (
                  <Button variant="secondary" size="sm" onClick={() => { onEscalate(arrearsCase, nextKey, escNotes); setEscNotes(""); }}>
                    <ChevronRight size={13} className="mr-1" />
                    Escalate to {stageLabelFor(nextKey)}
                  </Button>
                )}
                <Link
                  href={`/cases/${arrearsCase.id}`}
                  className="text-caption text-gray-400 hover:text-gold px-2 py-1.5 rounded hover:bg-gold/5 transition-colors"
                  title="Jump stages or step back on the case record — skipping requires a reason"
                >
                  Skip or step back…
                </Link>
                <button onClick={() => onDelete(arrearsCase.id)} className="flex items-center gap-1 text-caption text-gray-400 hover:text-expense px-2 py-1.5 rounded hover:bg-red-50 transition-colors">
                  <Trash2 size={12} />
                  Close case
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Letter modal */}
      <Modal open={letterModal} onClose={() => setLetterModal(false)} title={letter?.title ?? "Letter"} size="lg">
        <div className="space-y-3">
          {letter && (
            <p className="text-caption text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              {letter.purpose}
            </p>
          )}
          <textarea
            readOnly
            value={letterBody}
            rows={18}
            className="w-full border border-gray-200 rounded-lg px-3 py-3 text-caption tabular-nums bg-gray-50 resize-none focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLetterModal(false)}>Close</Button>
            <Button variant="gold" onClick={copyLetter} className="flex items-center gap-2">
              <Copy size={14} />
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

// ── Open case modal ────────────────────────────────────────────────────────────

function OpenCaseModal({ open, onClose, onCreated, prefill }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefill?: { tenantId: string; amount: number } | null;
}) {
  const [tenants, setTenants]   = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount]     = useState("");
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (open) fetch("/api/tenants").then(r=>r.json()).then(d => setTenants(d.filter((t:any) => t.isActive)));
  }, [open]);

  // Seed from an aging row when the modal is opened via "Create case".
  useEffect(() => {
    if (open && prefill) {
      setTenantId(prefill.tenantId);
      setAmount(prefill.amount ? String(prefill.amount) : "");
    }
  }, [open, prefill]);

  const selectedTenant = tenants.find((t:any) => t.id === tenantId);

  const submit = async () => {
    if (!tenantId) return;
    const propertyId = selectedTenant?.unit?.property?.id;
    if (!propertyId) { toast.error("Could not determine property"); return; }
    setLoading(true);
    const res = await fetch("/api/arrears", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ tenantId, propertyId, notes }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to open case");
      return;
    }
    toast.success("Arrears case opened");
    setTenantId(""); setAmount(""); setNotes("");
    onCreated(); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Open Arrears Case" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-caption font-medium text-gray-600 mb-1">Tenant</label>
          <select value={tenantId} onChange={e=>setTenantId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/30">
            <option value="">Select tenant…</option>
            {tenants.map((t:any) => (
              <option key={t.id} value={t.id}>{t.name} — Unit {t.unit?.unitNumber}</option>
            ))}
          </select>
        </div>
        {/* No amount field — the balance is read from this tenant's unpaid
            invoices, so it can't drift from the aging table or the reports. */}
        {amount && (
          <p className="text-caption text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            Outstanding balance is calculated from unpaid invoices — currently{" "}
            <span className="tabular-nums text-header">{amount}</span>.
          </p>
        )}
        <div>
          <label className="block text-caption font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Context or initial contact notes…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={submit} loading={loading} disabled={!tenantId}>Open Case</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Aging & Collections panel ───────────────────────────────────────────────────

type BucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";
interface AgingRow {
  tenantId: string; tenantName: string; unitNumber: string;
  propertyId: string; propertyName: string; currency: string;
  outstanding: number; oldestDueDate: string | null; oldestAgeDays: number;
  bucket: BucketKey; invoiceCount: number; hasOpenCase: boolean; openCaseId: string | null;
}
interface AgingData {
  summary: { totalOutstanding: number; totalCount: number; buckets: Record<BucketKey, { amount: number; count: number }> };
  rows: AgingRow[];
  collection: { period: { year: number; month: number } | null; billed: number; collected: number; rate: number | null; target: number; trend: { year: number; month: number; billed: number; collected: number; rate: number | null }[] };
}

const BUCKET_META: { key: BucketKey; label: string; tone: string }[] = [
  { key: "current", label: "Not yet due", tone: "text-gray-500" },
  { key: "d1_30",   label: "1–30 days",   tone: "text-amber-600" },
  { key: "d31_60",  label: "31–60 days",  tone: "text-amber-600" },
  { key: "d61_90",  label: "61–90 days",  tone: "text-orange-600" },
  { key: "d90plus", label: "90+ days",    tone: "text-expense" },
];
const BUCKET_BADGE: Record<BucketKey, "gray"|"amber"|"red"> = {
  current: "gray", d1_30: "amber", d31_60: "amber", d61_90: "amber", d90plus: "red",
};
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function AgingPanel({ data, currency, bucketFilter, onBucketFilter, onCreateCase, onOpenCase }: {
  data: AgingData | null;
  currency: string;
  bucketFilter: BucketKey | null;
  onBucketFilter: (b: BucketKey | null) => void;
  onCreateCase: (row: AgingRow) => void;
  onOpenCase: (caseId: string) => void;
}) {
  if (!data) return null;
  const { summary, rows, collection } = data;
  const hasAny = summary.totalCount > 0;
  const rate = collection.rate;
  const meetsTarget = rate != null && rate >= collection.target;
  const filteredRows = bucketFilter ? rows.filter((r) => r.bucket === bucketFilter) : rows;

  return (
    <div className="space-y-4">
      {/* Aging bucket strip */}
      <div>
        <p className="text-body font-medium text-header mb-2 flex items-center gap-1.5">
          Arrears aging
          <HelpTip text="Outstanding invoice balances grouped by how long they've been overdue. The 90+ bucket is the highest collection risk." />
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card padding="sm" className="border-l-4 border-header">
            <p className="text-label text-gray-400 uppercase ">Total outstanding</p>
            <CurrencyDisplay currency={currency} amount={summary.totalOutstanding} size="lg" className="text-header font-medium mt-1" />
            <p className="text-caption text-gray-400 mt-0.5">{summary.totalCount} tenant{summary.totalCount !== 1 ? "s" : ""}</p>
          </Card>
          {BUCKET_META.map((b) => {
            const cell = summary.buckets[b.key];
            const active = bucketFilter === b.key;
            return (
              <button
                key={b.key}
                onClick={() => onBucketFilter(active ? null : b.key)}
                className={clsx(
                  "text-left rounded-xl border p-3 transition-colors",
                  active ? "border-gold bg-gold/5" : "border-gray-100 hover:border-gray-200 bg-white",
                )}
              >
                <p className="text-label text-gray-400 uppercase ">{b.label}</p>
                <span className={clsx("block mt-1 tabular-nums text-body font-medium", cell.amount > 0 ? b.tone : "text-gray-300")}>
                  {formatCurrency(cell.amount, currency)}
                </span>
                <p className="text-caption text-gray-400 mt-0.5">{cell.count} inv</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Collection rate vs target */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Rent collection — this month
              <HelpTip text="Collected ÷ billed for the current period. Target comes from the property's management agreement KPI." position="below" />
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={clsx("text-h1 ", rate == null ? "text-gray-300" : meetsTarget ? "text-income" : "text-expense")}>
                {rate == null ? "—" : `${rate.toFixed(0)}%`}
              </span>
              <Badge variant={rate == null ? "gray" : meetsTarget ? "green" : "amber"}>
                target {collection.target.toFixed(0)}%
              </Badge>
            </div>
            <p className="text-caption text-gray-400 mt-0.5">
              {formatCurrency(collection.collected, currency)} of {formatCurrency(collection.billed, currency)} billed
            </p>
          </div>
          {/* 6-month trend */}
          <div className="flex items-end gap-1.5 h-16">
            {collection.trend.map((t) => {
              const h = t.rate == null ? 0 : Math.max(4, Math.round((t.rate / 100) * 56));
              const good = t.rate != null && t.rate >= collection.target;
              return (
                <div key={`${t.year}-${t.month}`} className="flex flex-col items-center gap-1" title={`${MONTH_ABBR[t.month-1]} ${t.year}: ${t.rate == null ? "n/a" : t.rate.toFixed(0)+"%"}`}>
                  <div className="w-5 bg-gray-100 rounded-sm flex items-end" style={{ height: 56 }}>
                    <div className={clsx("w-full rounded-sm", good ? "bg-income" : "bg-amber-400")} style={{ height: h }} />
                  </div>
                  <span className="text-label text-gray-400 ">{MONTH_ABBR[t.month-1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Per-tenant arrears table */}
      {hasAny && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <p className="text-body font-medium text-header ">
              Tenants in arrears{bucketFilter ? ` · ${BUCKET_META.find(b=>b.key===bucketFilter)?.label}` : ""}
            </p>
            {bucketFilter && (
              <button onClick={() => onBucketFilter(null)} className="text-caption text-gray-400 hover:text-gray-600">Clear filter</button>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-50">
            {filteredRows.map((r) => (
              <div key={r.tenantId} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-body font-medium text-header">{r.tenantName}</p>
                  <span className="tabular-nums text-body text-expense">{formatCurrency(r.outstanding, r.currency)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-caption text-gray-400 ">Unit {r.unitNumber} · {r.propertyName}</span>
                  <Badge variant={BUCKET_BADGE[r.bucket]}>{r.oldestAgeDays > 0 ? `${r.oldestAgeDays}d` : "current"}</Badge>
                </div>
                <div className="mt-2">
                  {r.hasOpenCase
                    ? <button onClick={() => onOpenCase(r.openCaseId!)} className="text-caption text-gold font-medium">Open case →</button>
                    : <button onClick={() => onCreateCase(r)} className="text-caption text-gold font-medium">Create case</button>}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-label font-medium text-gray-400 uppercase border-b border-gray-50">
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Unit / Property</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Oldest</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.map((r) => (
                  <tr key={r.tenantId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-body text-header ">{r.tenantName}</td>
                    <td className="px-4 py-3 text-body text-gray-500 ">Unit {r.unitNumber} · {r.propertyName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-body text-expense">{formatCurrency(r.outstanding, r.currency)}</td>
                    <td className="px-4 py-3"><Badge variant={BUCKET_BADGE[r.bucket]}>{r.oldestAgeDays > 0 ? `${r.oldestAgeDays}d overdue` : "not due"}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {r.hasOpenCase
                        ? <button onClick={() => onOpenCase(r.openCaseId!)} className="text-caption text-gold font-medium hover:underline">Open case →</button>
                        : <button onClick={() => onCreateCase(r)} className="text-caption text-gold font-medium hover:underline">Create case</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ArrearsPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = useProperty().currency;
  useFocusScroll();
  const [cases, setCases]       = useState<ArrearsCase[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [aging, setAging]       = useState<AgingData | null>(null);
  const [bucketFilter, setBucketFilter] = useState<BucketKey | null>(null);
  const [casePrefill, setCasePrefill]   = useState<{ tenantId: string; amount: number } | null>(null);
  // Membership role for the active org (never the global User.role); org
  // admins and super-admin get the same manager-tier actions.
  const arrearsOrgRole = (session?.user as any)?.orgRole as string | undefined;
  const arrearsSuperAdmin = session?.user?.role === "ADMIN" && (session?.user as any)?.organizationId == null;
  const isManager = arrearsSuperAdmin || arrearsOrgRole === "MANAGER" || arrearsOrgRole === "ADMIN";

  const load = useCallback(() => {
    setLoading(true);
    const propParam = selectedId ? `?propertyId=${selectedId}` : "";
    fetch(`/api/arrears${propParam}`).then(r=>r.json()).then(d => setCases(Array.isArray(d) ? d : [])).finally(()=>setLoading(false));
    fetch(`/api/arrears/aging${propParam}`).then(r=>r.json()).then(d => setAging(d)).catch(() => setAging(null));
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const openExistingCase = (caseId: string) => {
    const el = document.getElementById(`item-${caseId}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-gold", "rounded-2xl"); setTimeout(() => el.classList.remove("ring-2", "ring-gold", "rounded-2xl"), 2000); }
  };

  // The one-click button and the underlying API are independent decisions:
  // managers keep the affordance they know, while the call is a normal case
  // stage advance — so the SLA clock, timeline and audit trail all behave.
  const escalate = async (arrearsCase: ArrearsCase, stageKey: string, notes?: string) => {
    const res = await fetch(`/api/cases/${arrearsCase.id}/advance`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ toKey: stageKey, note: notes?.trim() || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(typeof err.error === "string" ? err.error : "Failed to escalate");
      return;
    }
    toast.success(`Escalated to ${stageLabelFor(stageKey)}`);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    // Closing an arrears case is a case status change, not a deletion — the
    // debt history has to survive.
    const res = await fetch(`/api/cases/${deleteId}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    setDeleting(false);
    setDeleteId(null);
    if (!res.ok) { toast.error("Failed to close case"); return; }
    toast.success("Case closed");
    load();
  };

  const open        = cases.filter(c => !c.isResolved);
  const resolved    = cases.filter(c => c.isResolved);
  const totalOwed   = open.reduce((s, c) => s + c.amountOwed, 0);
  const totalInterest = open.reduce((s, c) => s + accruedInterest(c), 0);

  const stageCount = (key: string) => open.filter(c => c.stageKey === key).length;

  return (
    <div>
      <Header title="Arrears Collection" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Aging & collections (derived from invoices) */}
        <AgingPanel
          data={aging}
          currency={currency}
          bucketFilter={bucketFilter}
          onBucketFilter={setBucketFilter}
          onCreateCase={(row) => { setCasePrefill({ tenantId: row.tenantId, amount: row.outstanding }); setShowOpen(true); }}
          onOpenCase={openExistingCase}
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card padding="sm" className="border-l-4 border-expense">
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Total Owed <HelpTip text="Sum of all unpaid rent and charges across your active arrears cases." position="below" />
            </p>
            <CurrencyDisplay currency={currency} amount={totalOwed} size="lg" className="text-expense font-medium mt-1" />
          </Card>
          {totalInterest > 0 && (
            <Card padding="sm" className="border-l-4 border-amber-400">
              <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
                Interest Accrued <HelpTip text="Late payment penalties calculated automatically. Resolving cases early prevents this from compounding." position="below" />
              </p>
              <CurrencyDisplay currency={currency} amount={totalInterest} size="lg" className="text-amber-600 font-medium mt-1" />
              <p className="text-caption text-amber-500 mt-0.5">on open cases</p>
            </Card>
          )}
          <Card padding="sm" className={clsx(!totalInterest && "border-l-4 border-amber-400")}>
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Open Cases <HelpTip text="Arrears cases that are still active and require follow-up action." position="below" />
            </p>
            <p className="text-h1 text-header mt-1">{open.length}</p>
          </Card>
          <Card padding="sm">
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Demand / Legal <HelpTip text="Cases escalated to formal demand letters or legal proceedings — the highest-risk category, act quickly." position="below" />
            </p>
            <p className="text-h1 text-header mt-1">{stageCount("DEMAND_LETTER") + stageCount("LEGAL_NOTICE")}</p>
          </Card>
          <Card padding="sm" className="border-l-4 border-income">
            <p className="text-label text-gray-400 uppercase flex items-center gap-1.5">
              Resolved <HelpTip text="Cases where the tenant paid in full or a settlement was reached." position="below" />
            </p>
            <p className="text-h1 text-header mt-1">{resolved.length}</p>
          </Card>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          <p className="text-body text-gray-500 ">
            {open.length} open · {resolved.length} resolved
          </p>
          <div className="flex items-center gap-2">
            {cases.length > 0 && (
              <button
                onClick={() => exportArrears(cases)}
                title="Export to Excel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
              >
                <FileDown size={13} /> Export
              </button>
            )}
            {isManager && (
              <Button variant="gold" onClick={() => setShowOpen(true)} className="flex items-center gap-2">
                <Plus size={16} />
                Open Case
              </Button>
            )}
          </div>
        </div>

        {/* Cases */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : open.length === 0 && !showResolved ? (
          <EmptyState
            icon={<CheckCircle size={32} className="text-gray-300" />}
            title="No open arrears cases"
            description="When a tenant falls behind on rent, open a case here to track the collection process."
          />
        ) : (
          <div className="space-y-3">
            {open.map(c => (
              <div key={c.id} id={`item-${c.id}`}>
                <CaseCard arrearsCase={c} isManager={isManager} onEscalate={escalate} onDelete={setDeleteId} />
              </div>
            ))}
            {resolved.length > 0 && (
              <div>
                <button onClick={() => setShowResolved(v => !v)} className="text-caption text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1 mb-3">
                  <ChevronRight size={12} className={clsx("transition-transform", showResolved && "rotate-90")} />
                  {showResolved ? "Hide" : "Show"} {resolved.length} resolved case{resolved.length!==1?"s":""}
                </button>
                {showResolved && resolved.map(c => (
                  <div key={c.id} id={`item-${c.id}`}>
                    <CaseCard arrearsCase={c} isManager={isManager} onEscalate={escalate} onDelete={setDeleteId} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <OpenCaseModal open={showOpen} onClose={() => { setShowOpen(false); setCasePrefill(null); }} onCreated={load} prefill={casePrefill} />
      <ConfirmDialog
        open={!!deleteId}
        title="Close arrears case?"
        message="The case and its escalation history will be permanently deleted."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
