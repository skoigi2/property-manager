"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  differenceInDays,
  addMonths,
  subMonths,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  AlertCircle,
  Info,
} from "lucide-react";
import Link from "next/link";
import type { CalendarEvent, EventType } from "@/app/api/calendar/route";

// ── Event type config ────────────────────────────────────────────────────────

type TypeConfig = {
  label: string;
  dot: string;
  badge: string;
  badgeInactive: string;
};

const TYPE_CONFIG: Record<EventType, TypeConfig> = {
  LEASE_EXPIRY:      { label: "Lease Expiry",   dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-800 border-amber-300",      badgeInactive: "bg-white text-gray-500 border-gray-200" },
  LEASE_START:       { label: "Lease Start",    dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", badgeInactive: "bg-white text-gray-500 border-gray-200" },
  MAINTENANCE_DUE:   { label: "Maintenance",    dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-800 border-blue-300",          badgeInactive: "bg-white text-gray-500 border-gray-200" },
  INSURANCE_RENEWAL: { label: "Insurance",      dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-800 border-orange-300",    badgeInactive: "bg-white text-gray-500 border-gray-200" },
  COMPLIANCE_EXPIRY: { label: "Compliance",     dot: "bg-purple-500",  badge: "bg-purple-100 text-purple-800 border-purple-300",    badgeInactive: "bg-white text-gray-500 border-gray-200" },
  RECURRING_EXPENSE: { label: "Recurring Exp.", dot: "bg-teal-500",    badge: "bg-teal-100 text-teal-800 border-teal-300",          badgeInactive: "bg-white text-gray-500 border-gray-200" },
  RENT_REMITTANCE:   { label: "Remittance",     dot: "bg-yellow-600",  badge: "bg-yellow-100 text-yellow-800 border-yellow-300",    badgeInactive: "bg-white text-gray-500 border-gray-200" },
  MGMT_FEE_INVOICE:  { label: "Mgmt Fee",       dot: "bg-gray-500",    badge: "bg-gray-100 text-gray-700 border-gray-300",          badgeInactive: "bg-white text-gray-500 border-gray-200" },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as EventType[];
const WEEKDAYS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function urgencyVariant(u: CalendarEvent["urgency"]): "red" | "amber" | "green" {
  if (u === "critical") return "red";
  if (u === "warning")  return "amber";
  return "green";
}

function daysLabel(n: number): string {
  if (n === 0)  return "Today";
  if (n === 1)  return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0)    return `${Math.abs(n)}d overdue`;
  return `in ${n}d`;
}

// ── KPI strip ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colour: string; // Tailwind text class
  bg: string;     // Tailwind bg class
}

function KpiCard({ label, value, icon, colour, bg }: KpiCardProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg}`}>
      <div className={`shrink-0 ${colour}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-2xl font-display font-bold leading-none ${colour}`}>{value}</p>
        <p className="text-xs font-sans text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession();

  const today = useMemo(() => new Date(), []);
  const [current, setCurrent]       = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [events, setEvents]           = useState<CalendarEvent[]>([]);
  const [overdueEvents, setOverdueEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [overdueExpanded, setOverdueExpanded] = useState(true);

  const year  = current.getFullYear();
  const month = current.getMonth() + 1;

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setOverdueEvents(d.overdueEvents ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { setCurrent((c) => subMonths(c, 1)); setSelectedDay(null); }
  function nextMonth() { setCurrent((c) => addMonths(c, 1)); setSelectedDay(null); }

  function toggleType(t: EventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size === 1) return prev;
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  // ── Calendar grid ────────────────────────────────────────────────────────

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(current), end: endOfMonth(current) }),
    [current]
  );
  const leadingBlanks  = getDay(startOfMonth(current));
  const trailingBlanks = (7 - ((days.length + leadingBlanks) % 7)) % 7;

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const e of events) {
      if (!activeTypes.has(e.type as EventType)) continue;
      const d = parseInt(e.date.slice(8, 10), 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [events, activeTypes]);

  const listEvents = useMemo(() => {
    const base = events.filter((e) => activeTypes.has(e.type as EventType));
    if (selectedDay !== null) {
      const prefix = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      return base.filter((e) => e.date === prefix);
    }
    return base;
  }, [events, activeTypes, selectedDay, year, month]);

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  // ── KPI values (computed from month events) ──────────────────────────────

  const totalEvents    = events.length;
  const criticalCount  = events.filter((e) => e.urgency === "critical").length;
  const warningCount   = events.filter((e) => e.urgency === "warning").length;
  const overdueCount   = overdueEvents.length;

  return (
    <div>
      <Header
        title="Calendar"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label={`Events in ${format(current, "MMM yyyy")}`}
            value={totalEvents}
            icon={<CalendarDays size={20} />}
            colour="text-header"
            bg="bg-white border-gray-100 shadow-sm"
          />
          <KpiCard
            label="Critical this month"
            value={criticalCount}
            icon={<AlertCircle size={20} />}
            colour={criticalCount > 0 ? "text-red-600" : "text-gray-400"}
            bg={criticalCount > 0 ? "bg-red-50 border-red-100 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
          <KpiCard
            label="Warnings this month"
            value={warningCount}
            icon={<AlertTriangle size={20} />}
            colour={warningCount > 0 ? "text-amber-600" : "text-gray-400"}
            bg={warningCount > 0 ? "bg-amber-50 border-amber-100 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
          <KpiCard
            label="Overdue (last 90 days)"
            value={overdueCount}
            icon={<Info size={20} />}
            colour={overdueCount > 0 ? "text-red-700" : "text-gray-400"}
            bg={overdueCount > 0 ? "bg-red-50 border-red-200 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
        </div>

        {/* ── Overdue strip ─────────────────────────────────────────────── */}
        {overdueEvents.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setOverdueExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span className="text-sm font-sans font-semibold text-red-700">
                  {overdueEvents.length} overdue item{overdueEvents.length !== 1 ? "s" : ""} — action required
                </span>
                <span className="text-xs text-red-500 font-sans hidden sm:inline">(past 90 days)</span>
              </div>
              {overdueExpanded
                ? <ChevronUp size={16} className="text-red-500 shrink-0" />
                : <ChevronDown size={16} className="text-red-500 shrink-0" />}
            </button>

            {overdueExpanded && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {overdueEvents.map((e) => {
                  const cfg = TYPE_CONFIG[e.type as EventType];
                  return (
                    <Link
                      key={e.id}
                      href={e.link}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-sans text-gray-700 hover:border-red-400 hover:bg-red-50 transition-colors group"
                      title={`${e.title} · ${e.propertyName}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="max-w-[160px] truncate">{e.title}</span>
                      <span className="text-gray-400 shrink-0">·</span>
                      <span className="text-red-600 font-medium shrink-0">{Math.abs(e.daysUntil)}d ago</span>
                      <ExternalLink size={11} className="text-gray-300 group-hover:text-red-400 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Filter chips ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((t) => {
            const cfg    = TYPE_CONFIG[t];
            const active = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-sans font-medium transition-colors ${
                  active ? cfg.badge : cfg.badgeInactive
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${active ? cfg.dot : "bg-gray-300"}`} />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">

            {/* ── Month grid ────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="font-display text-base text-gray-900">
                  {format(current, "MMMM yyyy")}
                </h2>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-gray-100">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-2 text-center text-xs font-sans font-medium text-gray-400">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {Array.from({ length: leadingBlanks }).map((_, i) => (
                  <div key={`blank-s-${i}`} className="min-h-[72px] border-b border-r border-gray-50" />
                ))}

                {days.map((day) => {
                  const d          = day.getDate();
                  const dayEvents  = eventsByDay.get(d) ?? [];
                  const isToday    = isCurrentMonth && d === today.getDate();
                  const isSelected = d === selectedDay;
                  const dotTypes   = Array.from(new Set(dayEvents.map((e) => e.type as EventType))).slice(0, 5);
                  const extraCount = dayEvents.length - dotTypes.length;

                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDay(isSelected ? null : d)}
                      className={`min-h-[72px] p-1.5 border-b border-r border-gray-50 flex flex-col items-start gap-1 transition-colors text-left ${
                        isSelected ? "bg-gold/10" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-sans font-medium ${
                          isToday
                            ? "bg-header text-white"
                            : isSelected
                            ? "bg-gold text-white"
                            : "text-gray-700"
                        }`}
                      >
                        {d}
                      </span>
                      {dotTypes.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 px-0.5">
                          {dotTypes.map((t) => (
                            <span
                              key={t}
                              className={`w-1.5 h-1.5 rounded-full ${TYPE_CONFIG[t].dot}`}
                              title={TYPE_CONFIG[t].label}
                            />
                          ))}
                          {extraCount > 0 && (
                            <span className="text-[9px] text-gray-400 leading-none self-center">
                              +{extraCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}

                {Array.from({ length: trailingBlanks }).map((_, i) => (
                  <div key={`blank-e-${i}`} className="min-h-[72px] border-b border-r border-gray-50" />
                ))}
              </div>
            </div>

            {/* ── Events list ───────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-sans font-medium text-sm text-gray-800">
                  {selectedDay !== null
                    ? format(new Date(year, month - 1, selectedDay), "d MMMM yyyy")
                    : `All events — ${format(current, "MMMM yyyy")}`}
                </h3>
                <span className="text-xs text-gray-400 font-sans">
                  {listEvents.length} event{listEvents.length !== 1 ? "s" : ""}
                </span>
              </div>

              {listEvents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400">
                  <p className="text-sm font-sans">
                    No events{selectedDay !== null ? " on this day" : " this month"}
                  </p>
                  {selectedDay !== null && (
                    <button
                      onClick={() => setSelectedDay(null)}
                      className="mt-2 text-xs text-gold hover:underline"
                    >
                      Show all month
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {listEvents.map((e) => {
                    const cfg = TYPE_CONFIG[e.type as EventType];
                    return (
                      <div key={e.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-sans text-gray-800 truncate">{e.title}</p>
                            <p className="text-xs text-gray-400 font-sans mt-0.5 truncate">
                              {e.propertyName}{e.unitName ? ` · ${e.unitName}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant={urgencyVariant(e.urgency)}>
                              {daysLabel(e.daysUntil)}
                            </Badge>
                            <Link
                              href={e.link}
                              className="text-gray-400 hover:text-gold transition-colors"
                              title="Go to source"
                            >
                              <ExternalLink size={13} />
                            </Link>
                          </div>
                        </div>
                        <p className="text-xs text-gray-300 font-sans mt-1 ml-[18px]">
                          {format(new Date(e.date + "T00:00:00"), "d MMM yyyy")} · {cfg.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
