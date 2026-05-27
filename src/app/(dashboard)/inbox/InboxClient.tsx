"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { VendorSelect } from "@/components/ui/VendorSelect";
import { InboxRowCard, InboxTableRow } from "@/components/inbox/InboxRow";
import { AlertOctagon, CalendarClock, CalendarRange, Inbox, Mail, Wrench, X } from "lucide-react";
import { useProperty } from "@/lib/property-context";
import type { InboxItem, InboxCounts } from "@/lib/inbox";

interface Props {
  userName?: string | null;
  role?: string;
}

export function InboxClient({ userName, role }: Props) {
  const { selectedId } = useProperty();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ urgent: 0, today: 0, thisWeek: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<null | "send-reminders" | "assign-vendor">(null);

  const load = useCallback(async () => {
    try {
      const qs = selectedId ? `?propertyId=${encodeURIComponent(selectedId)}` : "";
      const r = await fetch(`/api/inbox${qs}`);
      if (!r.ok) return;
      const data = await r.json();
      setItems(data.items ?? []);
      setCounts(data.counts ?? { urgent: 0, today: 0, thisWeek: 0 });
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    setLoading(true);
    setSelectedIds(new Set());
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const handleActionComplete = useCallback((itemId: string) => {
    // Optimistic removal — refetch in the background to reconcile
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    setSelectedIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    load();
  }, [load]);

  const toggleSelected = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const selectedInvoices = selectedItems.filter((it) => it.type === "INVOICE_OVERDUE");
  const selectedJobs = selectedItems.filter((it) => it.type === "URGENT_MAINTENANCE" || it.type === "PORTAL_REQUEST");

  const urgent = items.filter((i) => i.severity === "URGENT");
  const warning = items.filter((i) => i.severity === "WARNING");
  const info = items.filter((i) => i.severity === "INFO");

  return (
    <>
      <Header title="Inbox" userName={userName} role={role} />
      <div className="page-container pb-24">
        {/* KPI strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <KPI label="Urgent" value={counts.urgent} icon={<AlertOctagon size={18} />} tone="red" />
          <KPI label="Due today" value={counts.today} icon={<CalendarClock size={18} />} tone="amber" />
          <KPI label="This week" value={counts.thisWeek} icon={<CalendarRange size={18} />} tone="gold" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            <Section title="Urgent" items={urgent} selectedIds={selectedIds} onToggleSelected={toggleSelected} onActionComplete={handleActionComplete} />
            <Section title="Warning" items={warning} selectedIds={selectedIds} onToggleSelected={toggleSelected} onActionComplete={handleActionComplete} />
            <Section title="Info" items={info} selectedIds={selectedIds} onToggleSelected={toggleSelected} onActionComplete={handleActionComplete} />
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedItems.length >= 2 && (
        <div className="fixed inset-x-0 bottom-16 lg:bottom-4 z-40 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto flex items-center gap-3 bg-header text-white rounded-2xl shadow-2xl px-4 py-3 max-w-2xl w-full">
            <span className="text-sm font-sans font-medium">
              {selectedItems.length} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setBulkModal("send-reminders")}
              disabled={selectedInvoices.length === 0}
              className="flex items-center gap-1.5 text-xs font-sans font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={selectedInvoices.length === 0 ? "Select at least one overdue invoice" : ""}
            >
              <Mail size={13} />
              Send reminders ({selectedInvoices.length})
            </button>
            <button
              onClick={() => setBulkModal("assign-vendor")}
              disabled={selectedJobs.length === 0}
              className="flex items-center gap-1.5 text-xs font-sans font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={selectedJobs.length === 0 ? "Select at least one maintenance job" : ""}
            >
              <Wrench size={13} />
              Assign vendor ({selectedJobs.length})
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {bulkModal === "send-reminders" && (
        <BulkSendRemindersModal
          items={selectedInvoices}
          onClose={() => setBulkModal(null)}
          onDone={(processedIds) => {
            setBulkModal(null);
            processedIds.forEach((id) => handleActionComplete(id));
          }}
        />
      )}
      {bulkModal === "assign-vendor" && (
        <BulkAssignVendorModal
          items={selectedJobs}
          onClose={() => setBulkModal(null)}
          onDone={(processedIds) => {
            setBulkModal(null);
            processedIds.forEach((id) => handleActionComplete(id));
          }}
        />
      )}
    </>
  );
}

function KPI({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "red" | "amber" | "gold";
}) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    gold: "border-gold/30 bg-yellow-50 text-gold-dark",
  };
  return (
    <div className={`rounded-xl border-2 p-4 bg-white shadow-card ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 font-sans uppercase tracking-wide">{label}</p>
        <span className="text-gray-300 shrink-0">{icon}</span>
      </div>
      <p className="font-display text-3xl mt-2">{value}</p>
    </div>
  );
}

function Section({
  title, items, selectedIds, onToggleSelected, onActionComplete,
}: {
  title: string;
  items: InboxItem[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onActionComplete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-sm uppercase tracking-wider text-gray-500 mb-3">
        {title} <span className="text-gray-400">({items.length})</span>
      </h2>
      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <InboxRowCard
            key={it.id}
            item={it}
            selected={selectedIds.has(it.id)}
            onToggleSelected={() => onToggleSelected(it.id)}
            onActionComplete={onActionComplete}
          />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-4 py-2 w-8"></th>
              <th className="px-4 py-2 w-10"></th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">Item</th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">Property</th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">Due</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <InboxTableRow
                key={it.id}
                item={it}
                selected={selectedIds.has(it.id)}
                onToggleSelected={() => onToggleSelected(it.id)}
                onActionComplete={onActionComplete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/5 p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-3">
        <Inbox size={22} />
      </div>
      <p className="font-display text-lg text-header">All caught up</p>
      <p className="text-sm text-gray-500 font-sans mt-1">Nothing needs your attention right now.</p>
    </div>
  );
}

// ── Bulk modals ──────────────────────────────────────────────────────────────

function BulkSendRemindersModal({
  items, onClose, onDone,
}: {
  items: InboxItem[];
  onClose: () => void;
  onDone: (processedIds: string[]) => void;
}) {
  const [sending, setSending] = useState(false);

  async function run() {
    setSending(true);
    const processed: string[] = [];
    let logged = 0;
    for (const it of items) {
      if (!it.tenantId) continue;
      try {
        const r = await fetch(`/api/tenants/${it.tenantId}/communication-log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "EMAIL",
            subject: "Rent Reminder",
            body: "Bulk rent reminder generated from inbox. Please follow up with the tenant via email or SMS.",
            templateUsed: "rent_reminder",
          }),
        });
        if (r.ok) { processed.push(it.id); logged++; }
      } catch {
        // continue with next
      }
    }
    setSending(false);
    if (logged > 0) toast.success(`Logged ${logged} reminder${logged === 1 ? "" : "s"}`);
    else toast.error("No reminders could be logged");
    onDone(processed);
  }

  return (
    <Modal open onClose={onClose} title="Send rent reminders" size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm font-sans text-gray-600">
          Log a rent-reminder communication for {items.length} tenant{items.length === 1 ? "" : "s"}.
          A `CommunicationLog` row will be created for each so you can follow up by phone, SMS, or email.
        </p>
        <ul className="text-xs font-sans text-gray-500 list-disc list-inside max-h-40 overflow-y-auto">
          {items.map((it) => <li key={it.id}>{it.title}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={run} loading={sending}>Log reminders</Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkAssignVendorModal({
  items, onClose, onDone,
}: {
  items: InboxItem[];
  onClose: () => void;
  onDone: (processedIds: string[]) => void;
}) {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function run() {
    if (!vendorId) return;
    setSending(true);
    const processed: string[] = [];
    let assigned = 0;
    for (const it of items) {
      try {
        const body: any = { vendorId };
        if (it.type === "PORTAL_REQUEST") body.acknowledgedAt = new Date().toISOString();
        const r = await fetch(`/api/maintenance/${it.refId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) { processed.push(it.id); assigned++; }
      } catch { /* continue */ }
    }
    setSending(false);
    if (assigned > 0) toast.success(`Vendor assigned to ${assigned} job${assigned === 1 ? "" : "s"}`);
    else toast.error("No jobs could be updated");
    onDone(processed);
  }

  return (
    <Modal open onClose={onClose} title="Assign vendor to selected jobs" size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm font-sans text-gray-600">
          Assign one vendor to {items.length} maintenance job{items.length === 1 ? "" : "s"}.
        </p>
        <VendorSelect value={vendorId} onChange={setVendorId} label="Vendor" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={run} loading={sending} disabled={!vendorId}>Assign</Button>
        </div>
      </div>
    </Modal>
  );
}
