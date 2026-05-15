"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Spinner } from "@/components/ui/Spinner";
import { InboxRowCard, InboxTableRow } from "@/components/inbox/InboxRow";
import { AlertOctagon, CalendarClock, CalendarRange, Inbox } from "lucide-react";
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const qs = selectedId ? `?propertyId=${encodeURIComponent(selectedId)}` : "";
        const r = await fetch(`/api/inbox${qs}`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        setItems(data.items ?? []);
        setCounts(data.counts ?? { urgent: 0, today: 0, thisWeek: 0 });
      } catch {
        // swallow
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  const urgent = items.filter((i) => i.severity === "URGENT");
  const warning = items.filter((i) => i.severity === "WARNING");
  const info = items.filter((i) => i.severity === "INFO");

  return (
    <>
      <Header title="Inbox" userName={userName} role={role} />
      <div className="page-container">
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
            <Section title="Urgent" items={urgent} />
            <Section title="Warning" items={warning} />
            <Section title="Info" items={info} />
          </div>
        )}
      </div>
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

function Section({ title, items }: { title: string; items: InboxItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-sm uppercase tracking-wider text-gray-500 mb-3">
        {title} <span className="text-gray-400">({items.length})</span>
      </h2>
      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <InboxRowCard key={it.id} item={it} />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-4 py-2 w-10"></th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">
                Item
              </th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">
                Property
              </th>
              <th className="px-4 py-2 text-xs font-medium font-sans uppercase tracking-wide text-gray-500">
                Due
              </th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <InboxTableRow key={it.id} item={it} />
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
