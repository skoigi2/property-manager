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
import { AlertTriangle, ChevronRight, CheckCircle, Plus, Trash2, FileText, Copy, FileDown, TrendingUp } from "lucide-react";
import { exportArrears } from "@/lib/excel-export";
import { useFocusScroll } from "@/lib/use-focus-scroll";
import { clsx } from "clsx";
import { HelpTip } from "@/components/ui/HelpTip";

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage = "INFORMAL_REMINDER" | "DEMAND_LETTER" | "LEGAL_NOTICE" | "EVICTION" | "RESOLVED";

interface Escalation { id: string; stage: Stage; notes: string | null; createdAt: string; }
interface Tenant { id: string; name: string; phone: string | null; email: string | null; unit: { unitNumber: string }; }
interface ArrearsCase {
  id: string;
  tenantId: string;
  propertyId: string;
  stage: Stage;
  amountOwed: number;
  notes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: Tenant;
  property: { name: string; currency?: string };
  escalations: Escalation[];
  latePaymentInterestRate?: number; // annual %, from ManagementAgreement (default 12)
}

const MS_PER_DAY = 86_400_000;

function daysOpen(arrearsCase: ArrearsCase): number {
  const from = new Date(arrearsCase.createdAt).getTime();
  const to   = arrearsCase.resolvedAt
    ? new Date(arrearsCase.resolvedAt).getTime()
    : Date.now();
  return Math.max(0, Math.floor((to - from) / MS_PER_DAY));
}

function accruedInterest(arrearsCase: ArrearsCase): number {
  const rate = arrearsCase.latePaymentInterestRate ?? 12;
  if (rate === 0) return 0;
  return calcLateInterest(arrearsCase.amountOwed, rate, daysOpen(arrearsCase));
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGES: Stage[] = ["INFORMAL_REMINDER","DEMAND_LETTER","LEGAL_NOTICE","EVICTION","RESOLVED"];
const STAGE_LABELS: Record<Stage, string> = {
  INFORMAL_REMINDER: "Informal Reminder",
  DEMAND_LETTER:     "Demand Letter",
  LEGAL_NOTICE:      "Legal Notice",
  EVICTION:          "Eviction Notice",
  RESOLVED:          "Resolved",
};
const STAGE_BADGE: Record<Stage, "amber"|"gold"|"red"|"red"|"green"> = {
  INFORMAL_REMINDER: "amber",
  DEMAND_LETTER:     "gold",
  LEGAL_NOTICE:      "red",
  EVICTION:          "red",
  RESOLVED:          "green",
};
const STAGE_NEXT: Partial<Record<Stage, Stage>> = {
  INFORMAL_REMINDER: "DEMAND_LETTER",
  DEMAND_LETTER:     "LEGAL_NOTICE",
  LEGAL_NOTICE:      "EVICTION",
  EVICTION:          "RESOLVED",
};
const STAGE_NEXT_LABEL: Partial<Record<Stage, string>> = {
  INFORMAL_REMINDER: "Escalate to Demand Letter",
  DEMAND_LETTER:     "Escalate to Legal Notice",
  LEGAL_NOTICE:      "Escalate to Eviction Notice",
  EVICTION:          "Mark Resolved",
};
const STAGE_TIPS: Record<Stage, string> = {
  INFORMAL_REMINDER: "Initial polite contact about the overdue balance. Most cases resolve at this stage.",
  DEMAND_LETTER:     "Formal written demand requiring payment within 7 days. Creates a paper trail.",
  LEGAL_NOTICE:      "Legal proceedings have begun. Seek professional advice before proceeding.",
  EVICTION:          "Eviction notice served. This is the final escalation before court action.",
  RESOLVED:          "The balance has been paid or a settlement agreed. Case is closed.",
};

// ── Demand letter templates ────────────────────────────────────────────────────

function demandLetterTemplate(arrearsCase: ArrearsCase, stage: Stage): string {
  const tenant  = arrearsCase.tenant;
  const unit    = tenant.unit.unitNumber;
  const prop    = arrearsCase.property.name;
  const amount  = formatCurrency(arrearsCase.amountOwed, arrearsCase.property.currency ?? "USD");
  const today   = formatDate(new Date());

  if (stage === "DEMAND_LETTER") {
    return `DEMAND FOR RENT PAYMENT\n\nDate: ${today}\n\nTo: ${tenant.name}\nUnit ${unit}, ${prop}\n\nDear ${tenant.name.split(" ")[0]},\n\nDespite our previous reminder, we note that your rent account is in arrears of ${amount}.\n\nYou are hereby formally demanded to settle the outstanding balance in full within SEVEN (7) days of the date of this letter.\n\nFailure to comply will compel us to take legal action to recover the debt, including costs.\n\nYours faithfully,\nProperty Manager\n${prop}`;
  }
  if (stage === "LEGAL_NOTICE") {
    return `NOTICE TO REMEDY BREACH\n\nDate: ${today}\n\nTo: ${tenant.name}\nUnit ${unit}, ${prop}\n\nDear ${tenant.name.split(" ")[0]},\n\nYou are hereby given LEGAL NOTICE that your tenancy is in breach due to outstanding rent arrears of ${amount}.\n\nUnder the terms of your lease agreement, you are required to remedy this breach within FOURTEEN (14) days.\n\nIf the arrears are not cleared within this period, legal proceedings will be commenced without further notice.\n\nYours faithfully,\nProperty Manager\n${prop}`;
  }
  if (stage === "EVICTION") {
    return `NOTICE TO VACATE\n\nDate: ${today}\n\nTo: ${tenant.name}\nUnit ${unit}, ${prop}\n\nDear ${tenant.name.split(" ")[0]},\n\nYou are hereby given formal notice to VACATE the above premises.\n\nAs of this date, your rent arrears stand at ${amount} and previous notices have not resulted in payment.\n\nYou are required to vacate the premises and surrender vacant possession within THIRTY (30) days of this notice.\n\nThis notice does not extinguish the outstanding debt owed.\n\nYours faithfully,\nProperty Manager\n${prop}`;
  }
  return "";
}

// ── Case card ──────────────────────────────────────────────────────────────────

function CaseCard({ arrearsCase, isManager, onEscalate, onDelete, onAmountEdit }: {
  arrearsCase: ArrearsCase;
  isManager: boolean;
  onEscalate: (c: ArrearsCase, stage: Stage, notes?: string) => void;
  onDelete: (id: string) => void;
  onAmountEdit: (c: ArrearsCase, amount: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [escNotes, setEscNotes] = useState("");
  const [letterModal, setLetterModal] = useState(false);
  const [letterStage, setLetterStage] = useState<Stage>("DEMAND_LETTER");
  const [copied, setCopied] = useState(false);
  const [editAmount, setEditAmount] = useState(false);
  const [newAmount, setNewAmount] = useState(String(arrearsCase.amountOwed));

  const nextStage = STAGE_NEXT[arrearsCase.stage];
  const letter = demandLetterTemplate(arrearsCase, letterStage);

  const copyLetter = () => {
    navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAmountSave = () => {
    const n = parseFloat(newAmount);
    if (!isNaN(n) && n > 0) { onAmountEdit(arrearsCase, n); setEditAmount(false); }
  };

  return (
    <Card padding="md" className={arrearsCase.stage === "RESOLVED" ? "opacity-60" : ""}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          arrearsCase.stage === "RESOLVED" ? "bg-green-50" : "bg-red-50")}>
          {arrearsCase.stage === "RESOLVED"
            ? <CheckCircle size={16} className="text-income" />
            : <AlertTriangle size={16} className="text-expense" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-header">{arrearsCase.tenant.name}</p>
            <span className="inline-flex items-center gap-1">
              <Badge variant={STAGE_BADGE[arrearsCase.stage] as any}>{STAGE_LABELS[arrearsCase.stage]}</Badge>
              <HelpTip text={STAGE_TIPS[arrearsCase.stage]} />
            </span>
          </div>
          <p className="text-xs text-gray-400 font-sans mt-0.5">
            Unit {arrearsCase.tenant.unit.unitNumber} · {arrearsCase.property.name} · Opened {formatDate(new Date(arrearsCase.createdAt))}
            {arrearsCase.resolvedAt && ` · Resolved ${formatDate(new Date(arrearsCase.resolvedAt))}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {editAmount ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                className="w-28 border border-gray-200 rounded px-2 py-1 text-sm font-mono"
              />
              <button onClick={handleAmountSave} className="text-xs text-income font-medium px-2 py-1 hover:bg-green-50 rounded">Save</button>
              <button onClick={() => { setEditAmount(false); setNewAmount(String(arrearsCase.amountOwed)); }} className="text-xs text-gray-400 px-1 py-1">✕</button>
            </div>
          ) : (
            <button onClick={() => isManager && setEditAmount(true)} className={clsx("font-mono text-sm font-medium text-expense", isManager && "hover:underline cursor-pointer")}>
              {formatCurrency(arrearsCase.amountOwed, arrearsCase.property.currency ?? "USD")}
            </button>
          )}
          {/* Accrued interest */}
          {(() => {
            const interest = accruedInterest(arrearsCase);
            const rate     = arrearsCase.latePaymentInterestRate ?? 12;
            const days     = daysOpen(arrearsCase);
            if (interest <= 0) return null;
            return (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1" title={`${rate}% p.a. × ${days} days`}>
                <TrendingUp size={11} />
                <span className="font-mono text-xs font-medium">
                  +{formatCurrency(interest, arrearsCase.property.currency ?? "USD")}
                </span>
                <span className="text-[10px] text-amber-500 font-sans">{days}d interest</span>
              </div>
            );
          })()}
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            {expanded ? "Collapse" : "Expand"} <ChevronRight size={12} className={clsx("transition-transform", expanded && "rotate-90")} />
          </button>
        </div>
      </div>

      {/* Escalation history */}
      {expanded && (
        <div className="mt-4 pl-12 space-y-3">
          {/* Interest detail */}
          {(() => {
            const interest = accruedInterest(arrearsCase);
            const rate     = arrearsCase.latePaymentInterestRate ?? 12;
            const days     = daysOpen(arrearsCase);
            if (interest <= 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs font-sans text-amber-700">
                <span className="font-medium">Interest accrued: </span>
                {formatCurrency(interest, arrearsCase.property.currency ?? "USD")}
                <span className="text-amber-500"> · {rate}% p.a. × {days} days on {formatCurrency(arrearsCase.amountOwed, arrearsCase.property.currency ?? "USD")} outstanding</span>
              </div>
            );
          })()}
          {/* Timeline */}
          <div className="space-y-2">
            {arrearsCase.escalations.map(e => (
              <div key={e.id} className="flex items-start gap-2 text-xs font-sans">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                <div>
                  <span className="font-medium text-header">{STAGE_LABELS[e.stage]}</span>
                  <span className="text-gray-400 ml-1">· {formatDate(new Date(e.createdAt))}</span>
                  {e.notes && <p className="text-gray-500 mt-0.5">{e.notes}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Generate letter */}
          {arrearsCase.stage !== "INFORMAL_REMINDER" && arrearsCase.stage !== "RESOLVED" && (
            <button onClick={() => { setLetterStage(arrearsCase.stage); setLetterModal(true); }}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <FileText size={12} />
              Generate {STAGE_LABELS[arrearsCase.stage]} letter
            </button>
          )}

          {/* Actions */}
          {isManager && arrearsCase.stage !== "RESOLVED" && (
            <div className="space-y-2 pt-1">
              <textarea
                value={escNotes}
                onChange={e => setEscNotes(e.target.value)}
                placeholder="Notes for escalation (optional)..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
              />
              <div className="flex items-center gap-2 flex-wrap">
                {nextStage && (
                  <Button variant="secondary" size="sm" onClick={() => { onEscalate(arrearsCase, nextStage, escNotes); setEscNotes(""); }}>
                    <ChevronRight size={13} className="mr-1" />
                    {STAGE_NEXT_LABEL[arrearsCase.stage]}
                  </Button>
                )}
                <button onClick={() => onDelete(arrearsCase.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-expense px-2 py-1.5 rounded hover:bg-red-50 transition-colors">
                  <Trash2 size={12} />
                  Close case
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Letter modal */}
      <Modal open={letterModal} onClose={() => setLetterModal(false)} title={`${STAGE_LABELS[letterStage]} Letter`} size="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            {(["DEMAND_LETTER","LEGAL_NOTICE","EVICTION"] as Stage[]).map(s => (
              <button key={s} onClick={() => setLetterStage(s)}
                className={clsx("px-3 py-1.5 rounded-full border transition-colors", letterStage === s ? "bg-header text-white border-header" : "border-gray-200 hover:border-gray-300")}>
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
          <textarea
            readOnly
            value={letter}
            rows={18}
            className="w-full border border-gray-200 rounded-lg px-3 py-3 text-xs font-mono bg-gray-50 resize-none focus:outline-none"
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

function OpenCaseModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tenants, setTenants]   = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount]     = useState("");
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (open) fetch("/api/tenants").then(r=>r.json()).then(d => setTenants(d.filter((t:any) => t.isActive)));
  }, [open]);

  const selectedTenant = tenants.find((t:any) => t.id === tenantId);

  const submit = async () => {
    if (!tenantId || !amount) return;
    const propertyId = selectedTenant?.unit?.property?.id;
    if (!propertyId) { toast.error("Could not determine property"); return; }
    setLoading(true);
    const res = await fetch("/api/arrears", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ tenantId, propertyId, amountOwed: parseFloat(amount), notes }),
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Tenant</label>
          <select value={tenantId} onChange={e=>setTenantId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30">
            <option value="">Select tenant…</option>
            {tenants.map((t:any) => (
              <option key={t.id} value={t.id}>{t.name} — Unit {t.unit?.unitNumber}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount Owed</label>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Context or initial contact notes…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={submit} loading={loading} disabled={!tenantId || !amount}>Open Case</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ArrearsPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "USD";
  useFocusScroll();
  const [cases, setCases]       = useState<ArrearsCase[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const isManager = session?.user?.role === "MANAGER";

  const load = useCallback(() => {
    setLoading(true);
    const propParam = selectedId ? `?propertyId=${selectedId}` : "";
    fetch(`/api/arrears${propParam}`).then(r=>r.json()).then(d => setCases(Array.isArray(d) ? d : [])).finally(()=>setLoading(false));
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const escalate = async (arrearsCase: ArrearsCase, stage: Stage, notes?: string) => {
    const res = await fetch(`/api/arrears/${arrearsCase.id}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ stage, notes }),
    });
    if (!res.ok) { toast.error("Failed to escalate"); return; }
    toast.success(`Escalated to ${STAGE_LABELS[stage]}`);
    load();
  };

  const updateAmount = async (arrearsCase: ArrearsCase, amountOwed: number) => {
    const res = await fetch(`/api/arrears/${arrearsCase.id}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ amountOwed }),
    });
    if (!res.ok) { toast.error("Failed to update amount"); return; }
    toast.success("Amount updated");
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await fetch(`/api/arrears/${deleteId}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteId(null);
    toast.success("Case closed");
    load();
  };

  const open        = cases.filter(c => c.stage !== "RESOLVED");
  const resolved    = cases.filter(c => c.stage === "RESOLVED");
  const totalOwed   = open.reduce((s, c) => s + c.amountOwed, 0);
  const totalInterest = open.reduce((s, c) => s + accruedInterest(c), 0);

  const stageCount = (s: Stage) => open.filter(c => c.stage === s).length;

  return (
    <div>
      <Header title="Arrears Collection" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card padding="sm" className="border-l-4 border-expense">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-sans flex items-center gap-1.5">
              Total Owed <HelpTip text="Sum of all unpaid rent and charges across your active arrears cases." position="below" />
            </p>
            <CurrencyDisplay currency={currency} amount={totalOwed} size="lg" className="text-expense font-medium mt-1" />
          </Card>
          {totalInterest > 0 && (
            <Card padding="sm" className="border-l-4 border-amber-400">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-sans flex items-center gap-1.5">
                Interest Accrued <HelpTip text="Late payment penalties calculated automatically. Resolving cases early prevents this from compounding." position="below" />
              </p>
              <CurrencyDisplay currency={currency} amount={totalInterest} size="lg" className="text-amber-600 font-medium mt-1" />
              <p className="text-xs text-amber-500 font-sans mt-0.5">on open cases</p>
            </Card>
          )}
          <Card padding="sm" className={clsx(!totalInterest && "border-l-4 border-amber-400")}>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-sans flex items-center gap-1.5">
              Open Cases <HelpTip text="Arrears cases that are still active and require follow-up action." position="below" />
            </p>
            <p className="text-2xl font-display text-header mt-1">{open.length}</p>
          </Card>
          <Card padding="sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-sans flex items-center gap-1.5">
              Demand / Legal <HelpTip text="Cases escalated to formal demand letters or legal proceedings — the highest-risk category, act quickly." position="below" />
            </p>
            <p className="text-2xl font-display text-header mt-1">{stageCount("DEMAND_LETTER") + stageCount("LEGAL_NOTICE")}</p>
          </Card>
          <Card padding="sm" className="border-l-4 border-income">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-sans flex items-center gap-1.5">
              Resolved <HelpTip text="Cases where the tenant paid in full or a settlement was reached." position="below" />
            </p>
            <p className="text-2xl font-display text-header mt-1">{resolved.length}</p>
          </Card>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 font-sans">
            {open.length} open · {resolved.length} resolved
          </p>
          <div className="flex items-center gap-2">
            {cases.length > 0 && (
              <button
                onClick={() => exportArrears(cases)}
                title="Export to Excel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
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
                <CaseCard arrearsCase={c} isManager={isManager} onEscalate={escalate} onDelete={setDeleteId} onAmountEdit={updateAmount} />
              </div>
            ))}
            {resolved.length > 0 && (
              <div>
                <button onClick={() => setShowResolved(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1 mb-3">
                  <ChevronRight size={12} className={clsx("transition-transform", showResolved && "rotate-90")} />
                  {showResolved ? "Hide" : "Show"} {resolved.length} resolved case{resolved.length!==1?"s":""}
                </button>
                {showResolved && resolved.map(c => (
                  <div key={c.id} id={`item-${c.id}`}>
                    <CaseCard arrearsCase={c} isManager={isManager} onEscalate={escalate} onDelete={setDeleteId} onAmountEdit={updateAmount} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <OpenCaseModal open={showOpen} onClose={() => setShowOpen(false)} onCreated={load} />
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
