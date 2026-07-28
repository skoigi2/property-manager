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
import { useCachedFetch } from "@/lib/use-cached-fetch";
import type { InboxItem, InboxCounts } from "@/lib/inbox";

interface InboxPayload {
  items: InboxItem[];
  counts: InboxCounts;
}

interface Props {
  userName?: string | null;
  role?: string;
}

export function InboxClient({ userName, role }: Props) {
  const { selectedId } = useProperty();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<null | "send-reminders" | "assign-vendor">(null);

  // SWR-from-sessionStorage — instant hydrate on repeat visits, background refresh.
  const qs = selectedId ? `?propertyId=${encodeURIComponent(selectedId)}` : "";
  const { data, loading, refresh, setData } =
    useCachedFetch<InboxPayload>(`inbox:${selectedId ?? "all"}`, `/api/inbox${qs}`);
  const items = data?.items ?? [];
  const counts = data?.counts ?? { urgent: 0, today: 0, thisWeek: 0 };

  // Clear selections when the property filter changes (cache hook re-keys, but
  // the user's row selections shouldn't carry across scopes).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedId]);

  const handleActionComplete = useCallback((itemId: string) => {
    // Optimistic removal — drop the row from the cached value immediately and
    // refetch in the background to reconcile.
    setData((prev) => prev
      ? { ...prev, items: prev.items.filter((it) => it.id !== itemId) }
      : prev);
    setSelectedIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    refresh();
  }, [setData, refresh]);

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
    try {
      const r = await fetch("/api/inbox/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: items.map((it) => it.refId) }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to send reminders");

      const sentInvoiceIds = new Set((data.sentDetails ?? []).map((s: { invoiceId: string }) => s.invoiceId));
      for (const it of items) if (sentInvoiceIds.has(it.refId)) processed.push(it.id);

      if (data.failed > 0) {
        const names = (data.failedDetails ?? [])
          .map((f: { tenant: string; error: string }) => `${f.tenant} (${f.error})`)
          .join("; ");
        toast.error(`${data.sent} emailed · ${data.failed} failed: ${names}`, { duration: 8000 });
      } else {
        toast.success(`Reminder emailed to ${data.sent} tenant${data.sent === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSending(false);
    onDone(processed);
  }

  return (
    <Modal open onClose={onClose} title="Send rent reminders" size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm font-sans text-gray-600">
          Email a rent-payment reminder to {items.length} tenant{items.length === 1 ? "" : "s"} with an
          overdue invoice. Each email shows the invoice number, amount outstanding and days overdue,
          and is logged in the tenant&apos;s communication trail. Tenants without an email address will be
          reported back so you can follow up by phone or SMS.
        </p>
        <ul className="text-xs font-sans text-gray-500 list-disc list-inside max-h-40 overflow-y-auto">
          {items.map((it) => <li key={it.id}>{it.title}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={run} loading={sending}>Send reminders</Button>
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
