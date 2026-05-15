"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Mail,
  Wrench,
  AlertTriangle,
  CalendarCheck,
  TrendingUp,
  ExternalLink,
  MoreVertical,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { VendorSelect } from "@/components/ui/VendorSelect";
import { HelpTip } from "@/components/ui/HelpTip";
import { EmailDraftModal } from "@/components/tenants/EmailDraftModal";
import type { InboxItem } from "@/lib/inbox";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STAGE_ORDER = ["INFORMAL_REMINDER", "DEMAND_LETTER", "LEGAL_NOTICE", "EVICTION", "RESOLVED"] as const;
const STAGE_NEXT: Record<string, string> = {
  INFORMAL_REMINDER: "DEMAND_LETTER",
  DEMAND_LETTER: "LEGAL_NOTICE",
  LEGAL_NOTICE: "EVICTION",
  EVICTION: "RESOLVED",
};

interface ActionDef {
  key: string;
  label: string;
  tip: string;
  onClick: () => void;
  icon: React.ElementType;
}

interface Props {
  item: InboxItem;
  /** Called after a mutating action succeeds — typically removes the row + refetches. */
  onActionComplete: (itemId: string) => void;
}

interface TenantSnapshot {
  id: string;
  name: string;
  email: string | null;
  monthlyRent: number;
  serviceCharge: number;
  leaseEnd: string | null;
  proposedRent: number | null;
  proposedLeaseEnd: string | null;
}

async function fetchTenant(tenantId: string): Promise<TenantSnapshot | null> {
  try {
    const r = await fetch(`/api/tenants/${tenantId}`);
    if (!r.ok) return null;
    const t = await r.json();
    return {
      id: t.id,
      name: t.name,
      email: t.email,
      monthlyRent: t.monthlyRent,
      serviceCharge: t.serviceCharge ?? 0,
      leaseEnd: t.leaseEnd,
      proposedRent: t.proposedRent,
      proposedLeaseEnd: t.proposedLeaseEnd,
    };
  } catch {
    return null;
  }
}

export function InboxActions({ item, onActionComplete }: Props) {
  type ModalKind =
    | null
    | "vendor"
    | "priority"
    | "renew-compliance"
    | "renew-insurance"
    | "advance-stage"
    | "log-contact"
    | "email-rent-reminder"
    | "email-renewal-offer";

  const [modal, setModal] = useState<ModalKind>(null);
  const [tenant, setTenant] = useState<TenantSnapshot | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside for mobile menu
  useEffect(() => {
    if (!mobileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mobileOpen]);

  async function patch(url: string, body: any, successMsg: string) {
    const t = toast.loading("Saving…");
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text().catch(() => "Failed"));
      toast.success(successMsg, { id: t });
      onActionComplete(item.id);
    } catch (e: any) {
      toast.error(e?.message || "Action failed", { id: t });
    }
  }

  async function post(url: string, body: any, successMsg: string) {
    const t = toast.loading("Saving…");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text().catch(() => "Failed"));
      toast.success(successMsg, { id: t });
      onActionComplete(item.id);
    } catch (e: any) {
      toast.error(e?.message || "Action failed", { id: t });
    }
  }

  async function openEmailModal(kind: "email-rent-reminder" | "email-renewal-offer") {
    if (!item.tenantId) return;
    if (!tenant) {
      const t = await fetchTenant(item.tenantId);
      if (!t) { toast.error("Could not load tenant"); return; }
      setTenant(t);
    }
    setModal(kind);
  }

  // Build the per-type action list
  const actions: ActionDef[] = [];

  if (item.type === "INVOICE_OVERDUE") {
    actions.push({
      key: "send-reminder",
      label: "Send reminder",
      tip: "Opens a pre-filled rent reminder email with copy + mail link.",
      icon: Mail,
      onClick: () => openEmailModal("email-rent-reminder"),
    });
    actions.push({
      key: "mark-paid",
      label: "Mark paid",
      tip: "Marks the invoice PAID and creates a matching income entry.",
      icon: CheckCircle2,
      onClick: () => patch(`/api/invoices/${item.refId}`, { status: "PAID" }, "Marked paid"),
    });
  }

  if (item.type === "LEASE_EXPIRY") {
    actions.push({
      key: "send-renewal",
      label: "Send renewal offer",
      tip: "Opens a renewal-offer email. Stage advances to NOTICE_SENT after you copy or open in mail.",
      icon: Mail,
      onClick: () => openEmailModal("email-renewal-offer"),
    });
    actions.push({
      key: "mark-notice",
      label: "Mark NOTICE_SENT",
      tip: "Sets the lease renewal stage to NOTICE_SENT without sending an email.",
      icon: CheckCircle2,
      onClick: () => patch(`/api/tenants/${item.refId}/renewal`, { renewalStage: "NOTICE_SENT" }, "Stage updated"),
    });
  }

  if (item.type === "URGENT_MAINTENANCE" || item.type === "PORTAL_REQUEST") {
    actions.push({
      key: "assign-vendor",
      label: item.type === "PORTAL_REQUEST" ? "Triage → assign vendor" : "Assign vendor",
      tip: "Assigns a vendor to this job. Acknowledges portal requests at the same time.",
      icon: Wrench,
      onClick: () => setModal("vendor"),
    });
    if (item.type === "URGENT_MAINTENANCE") {
      actions.push({
        key: "in-progress",
        label: "Mark in progress",
        tip: "Marks the job IN_PROGRESS and records the time as acknowledged.",
        icon: CheckCircle2,
        onClick: () => patch(`/api/maintenance/${item.refId}`, { status: "IN_PROGRESS" }, "Job in progress"),
      });
    } else {
      actions.push({
        key: "priority",
        label: "Set priority",
        tip: "Reclassifies how urgent this tenant request is.",
        icon: AlertTriangle,
        onClick: () => setModal("priority"),
      });
    }
  }

  if (item.type === "COMPLIANCE_EXPIRY") {
    actions.push({
      key: "renew-compliance",
      label: "Mark renewed",
      tip: "Records that the certificate has been renewed and sets a new expiry date.",
      icon: CalendarCheck,
      onClick: () => setModal("renew-compliance"),
    });
  }

  if (item.type === "INSURANCE_EXPIRY") {
    actions.push({
      key: "renew-insurance",
      label: "Mark renewed",
      tip: "Records that the policy has been renewed and sets a new end date.",
      icon: CalendarCheck,
      onClick: () => setModal("renew-insurance"),
    });
  }

  if (item.type === "ARREARS_ESCALATION") {
    actions.push({
      key: "advance-stage",
      label: "Advance stage",
      tip: "Moves the arrears case to its next stage and records the change.",
      icon: TrendingUp,
      onClick: () => setModal("advance-stage"),
    });
    actions.push({
      key: "log-contact",
      label: "Log contact",
      tip: "Records a contact attempt against this tenant's communication log.",
      icon: Mail,
      onClick: () => setModal("log-contact"),
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Desktop inline buttons */}
      <div className="hidden md:flex items-center gap-1.5">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <span key={a.key} className="inline-flex items-center">
              <button
                onClick={a.onClick}
                className="inline-flex items-center gap-1 text-xs font-sans font-medium text-gray-600 hover:text-gold hover:bg-gold/5 px-2 py-1 rounded-md transition-colors"
              >
                <Icon size={12} />
                {a.label}
              </button>
              <HelpTip text={a.tip} />
            </span>
          );
        })}
        <Link
          href={item.href}
          className="inline-flex items-center gap-1 text-xs font-sans font-medium text-gold hover:text-gold-dark px-2 py-1 rounded-md"
        >
          <ExternalLink size={12} />
          Open
        </Link>
      </div>

      {/* Mobile 3-dot menu */}
      <div className="md:hidden relative" ref={menuRef}>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileOpen((v) => !v); }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="More actions"
        >
          <MoreVertical size={16} />
        </button>
        {mobileOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileOpen(false); a.onClick(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-sm font-sans text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icon size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{a.label}</span>
                </button>
              );
            })}
            <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-sm font-sans text-gold hover:bg-gold/5 transition-colors border-t border-gray-100"
            >
              <ExternalLink size={14} className="shrink-0" />
              Open
            </Link>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "vendor" && (
        <AssignVendorModal
          item={item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "priority" && (
        <SetPriorityModal
          item={item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "renew-compliance" && (
        <RenewExpiryModal
          item={item}
          field="expiryDate"
          url={`/api/compliance/certificates/${item.refId}`}
          label="New expiry date"
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "renew-insurance" && (
        <RenewExpiryModal
          item={item}
          field="endDate"
          url={`/api/insurance/${item.refId}`}
          label="New end date"
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "advance-stage" && (
        <AdvanceStageModal
          item={item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "log-contact" && item.tenantId && (
        <LogContactModal
          tenantId={item.tenantId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onActionComplete(item.id); }}
        />
      )}
      {modal === "email-rent-reminder" && tenant && (
        <EmailDraftModal
          tenant={tenant}
          tenantId={tenant.id}
          currency={item.propertyCurrency}
          initialTemplate="rent_reminder"
          onClose={() => setModal(null)}
        />
      )}
      {modal === "email-renewal-offer" && tenant && (
        <EmailDraftModal
          tenant={tenant}
          tenantId={tenant.id}
          currency={item.propertyCurrency}
          initialTemplate="renewal_offer"
          onUsed={() => {
            // Fire-and-forget — keep modal open so user can finish writing
            fetch(`/api/tenants/${item.refId}/renewal`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ renewalStage: "NOTICE_SENT" }),
            }).then(() => toast.success("Renewal stage set to NOTICE_SENT"));
            onActionComplete(item.id);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ── Modal components ─────────────────────────────────────────────────────────

function AssignVendorModal({ item, onClose, onSaved }: { item: InboxItem; onClose: () => void; onSaved: () => void }) {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!vendorId) return;
    setSaving(true);
    try {
      const body: any = { vendorId };
      // For portal triage, also acknowledge it
      if (item.type === "PORTAL_REQUEST") body.acknowledgedAt = new Date().toISOString();
      const r = await fetch(`/api/maintenance/${item.refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast.success("Vendor assigned");
      onSaved();
    } catch {
      toast.error("Failed to assign vendor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Assign vendor" size="sm">
      <div className="p-5 space-y-4">
        <VendorSelect value={vendorId} onChange={setVendorId} label="Vendor" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} loading={saving} disabled={!vendorId}>Assign</Button>
        </div>
      </div>
    </Modal>
  );
}

function SetPriorityModal({ item, onClose, onSaved }: { item: InboxItem; onClose: () => void; onSaved: () => void }) {
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("MEDIUM");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/maintenance/${item.refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority, acknowledgedAt: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error();
      toast.success("Priority updated");
      onSaved();
    } catch {
      toast.error("Failed to update priority");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Set priority" size="sm">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-3 py-2 rounded-lg text-sm font-sans font-medium border transition-colors ${
                priority === p ? "border-gold bg-gold/10 text-gold-dark" : "border-gray-200 text-gray-600 hover:border-gold/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function RenewExpiryModal({
  item, field, url, label, onClose, onSaved,
}: {
  item: InboxItem;
  field: "expiryDate" | "endDate";
  url: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Default to one year from today
  const oneYear = new Date();
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  const [date, setDate] = useState(oneYear.toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: new Date(date).toISOString() }),
      });
      if (!r.ok) throw new Error();
      toast.success("Marked renewed");
      onSaved();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item.title} size="sm">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium font-sans text-gray-500 mb-1">{label}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} loading={saving}>Mark renewed</Button>
        </div>
      </div>
    </Modal>
  );
}

function AdvanceStageModal({ item, onClose, onSaved }: { item: InboxItem; onClose: () => void; onSaved: () => void }) {
  // Pull the current stage from the subtitle ("Stage: <STAGE> · …") for default-next
  const currentStage = (() => {
    const m = item.subtitle.match(/Stage:\s*([A-Z_ ]+)/);
    if (!m) return "INFORMAL_REMINDER";
    return m[1].trim().replace(/ /g, "_");
  })();
  const defaultNext = (STAGE_NEXT[currentStage] ?? "DEMAND_LETTER") as typeof STAGE_ORDER[number];
  const [stage, setStage] = useState<typeof STAGE_ORDER[number]>(defaultNext);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/arrears/${item.refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, notes: notes || undefined }),
      });
      if (!r.ok) throw new Error();
      toast.success("Stage advanced");
      onSaved();
    } catch {
      toast.error("Failed to advance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Advance arrears stage" size="sm">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium font-sans text-gray-500 mb-1">New stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as typeof STAGE_ORDER[number])}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans"
          >
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium font-sans text-gray-500 mb-1">Notes (optional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans resize-none"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} loading={saving}>Advance</Button>
        </div>
      </div>
    </Modal>
  );
}

function LogContactModal({ tenantId, onClose, onSaved }: { tenantId: string; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState("Arrears contact attempt");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/communication-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "EMAIL", subject, body }),
      });
      if (!r.ok) throw new Error();
      toast.success("Contact logged");
      onSaved();
    } catch {
      toast.error("Failed to log contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Log contact attempt" size="sm">
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium font-sans text-gray-500 mb-1">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans"
          />
        </div>
        <div>
          <label className="block text-xs font-medium font-sans text-gray-500 mb-1">Notes</label>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What was attempted? (call, SMS, doorstep…)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans resize-none"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} loading={saving} disabled={!subject}>Log</Button>
        </div>
      </div>
    </Modal>
  );
}
