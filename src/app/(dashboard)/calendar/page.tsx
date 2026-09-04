"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useProperty } from "@/lib/property-context";
import { useSharedMonth } from "@/lib/use-shared-month";
import { formatCurrency } from "@/lib/currency";
import toast from "react-hot-toast";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isSameWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfDay,
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
  RefreshCw,
  CalendarRange,
  Loader2,
  LayoutGrid,
  List,
  Banknote,
  Users,
  Wrench,
  ShieldCheck,
  SlidersHorizontal,
  Columns3,
  Settings2,
  CheckCircle2,
  Inbox,
  UserCheck,
  BellOff,
  Clock,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type {
  CalendarEvent, EventType, CalendarAction, CalendarSourceStatus,
} from "@/lib/calendar-events";

// ── Event type config ────────────────────────────────────────────────────────

type TypeConfig = {
  label: string;
  /** Plural noun for a rolled-up cluster, e.g. "12 rent payments due". */
  plural: string;
  dot: string;
  badge: string;
};

const TYPE_CONFIG: Record<EventType, TypeConfig> = {
  RENT_DUE:          { label: "Rent Due",     plural: "rent payments due",   dot: "bg-green-600",   badge: "bg-green-100 text-green-800 border-green-300" },
  LEASE_EXPIRY:      { label: "Lease Expiry", plural: "leases expiring",     dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-800 border-amber-300" },
  LEASE_START:       { label: "Lease Start",  plural: "leases starting",     dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  MAINTENANCE_VISIT: { label: "Visit",        plural: "maintenance visits",  dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-800 border-sky-300" },
  MAINTENANCE_DUE:   { label: "Maintenance",  plural: "maintenance tasks",   dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-800 border-blue-300" },
  INSURANCE_RENEWAL: { label: "Insurance",    plural: "policies renewing",   dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-800 border-orange-300" },
  WARRANTY_EXPIRY:   { label: "Warranty",     plural: "warranties ending",   dot: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  COMPLIANCE_EXPIRY: { label: "Compliance",   plural: "certificates expiring", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-800 border-purple-300" },
  RECURRING_EXPENSE: { label: "Recurring",    plural: "recurring expenses",  dot: "bg-teal-500",    badge: "bg-teal-100 text-teal-800 border-teal-300" },
  APPROVAL_DEADLINE: { label: "Approvals",    plural: "approvals expiring",  dot: "bg-pink-500",    badge: "bg-pink-100 text-pink-800 border-pink-300" },
  // "SLA" is internal jargon — managers read this as a response deadline.
  CASE_SLA:          { label: "Case deadline", plural: "case deadlines",     dot: "bg-rose-500",    badge: "bg-rose-100 text-rose-800 border-rose-300" },
  RENT_REMITTANCE:   { label: "Remittance",   plural: "remittances due",     dot: "bg-yellow-600",  badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  MGMT_FEE_INVOICE:  { label: "Mgmt Fee",     plural: "mgmt fee invoices",   dot: "bg-gray-500",    badge: "bg-gray-100 text-gray-700 border-gray-300" },
};

/**
 * Twelve type chips is a menu, not a filter. Managers think in four buckets,
 * so those are the default control; the per-type chips stay available behind
 * "Refine" for when you genuinely need one type on its own.
 */
const EVENT_GROUPS: { key: string; label: string; icon: LucideIcon; types: EventType[] }[] = [
  { key: "MONEY",    label: "Money",      icon: Banknote,    types: ["RENT_DUE", "RECURRING_EXPENSE", "RENT_REMITTANCE", "MGMT_FEE_INVOICE"] },
  { key: "TENANCY",  label: "Tenancies",  icon: Users,       types: ["LEASE_EXPIRY", "LEASE_START"] },
  { key: "BUILDING", label: "Building",   icon: Wrench,      types: ["MAINTENANCE_VISIT", "MAINTENANCE_DUE", "WARRANTY_EXPIRY"] },
  { key: "ADMIN",    label: "Compliance", icon: ShieldCheck, types: ["INSURANCE_RENEWAL", "COMPLIANCE_EXPIRY", "APPROVAL_DEADLINE", "CASE_SLA"] },
];

const BADGE_INACTIVE = "bg-white text-gray-400 border-gray-200";
const ALL_TYPES = Object.keys(TYPE_CONFIG) as EventType[];
/** Below this, a cluster is clearer listed out than summarised. */
const ROLLUP_MIN = 3;

type CalendarView = "month" | "week" | "agenda";
const VIEW_KEY = "gw:calendarView";

const VIEWS: { key: CalendarView; label: string; icon: LucideIcon }[] = [
  { key: "month",  label: "Month",  icon: LayoutGrid },
  { key: "week",   label: "Week",   icon: Columns3 },
  { key: "agenda", label: "Agenda", icon: List },
];
// Monday-first, matching CaseCalendarView so the app has one week shape.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FILTER_KEY = "gw:calendarTypeFilter";

// ── Helpers ──────────────────────────────────────────────────────────────────

function urgencyVariant(u: CalendarEvent["urgency"]): "red" | "amber" | "green" {
  if (u === "critical") return "red";
  if (u === "warning") return "amber";
  return "green";
}

function daysLabel(n: number): string {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${Math.abs(n)}d ago`;
  return `in ${n}d`;
}

// ── KPI strip ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, colour, bg,
}: {
  label: string; value: number; icon: React.ReactNode; colour: string; bg: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg}`}>
      <div className={`shrink-0 ${colour}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-h1 ${colour}`}>{value}</p>
        <p className="text-caption text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

// ── Event row (shared by the side panel and the mobile agenda) ───────────────

const SNOOZE_PRESETS: { key: string; label: string }[] = [
  { key: "1h", label: "1 hour" },
  { key: "1d", label: "Tomorrow" },
  { key: "1w", label: "Next week" },
  { key: "dismiss", label: "Hide until I restore it" },
];

function EventRow({
  event, onAction, busy, onSnooze,
}: {
  event: CalendarEvent;
  onAction: (e: CalendarEvent, a: CalendarAction) => void;
  busy: boolean;
  onSnooze: (e: CalendarEvent, preset: string) => void;
}) {
  const cfg = TYPE_CONFIG[event.type];
  const postActions = event.actions.filter((a) => a.endpoint);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <Link href={event.link} className="block group">
            <p className="text-body text-gray-800 group-hover:text-gold transition-colors">
              {event.title}
            </p>
          </Link>
          <p className="text-caption text-gray-400 mt-0.5 truncate">
            {event.propertyName}
            {event.unitName ? ` · Unit ${event.unitName}` : ""}
            {event.amount !== undefined && event.currency
              ? ` · ${formatCurrency(event.amount, event.currency)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={urgencyVariant(event.urgency)}>{daysLabel(event.daysUntil)}</Badge>
          <Link
            href={event.link}
            className="text-gray-300 hover:text-gold transition-colors"
            title="Open record"
            aria-label={`Open ${event.title}`}
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-1.5 ml-[18px] flex-wrap">
        <span className="text-caption text-gray-300 ">
          {format(new Date(event.date + "T00:00:00"), "d MMM")} · {cfg.label}
        </span>
        {postActions.map((a) => (
          <button
            key={a.label}
            onClick={() => onAction(event, a)}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 text-caption text-gray-600 hover:text-gold hover:border-gold transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 size={10} className="animate-spin" />}
            {a.label}
          </button>
        ))}

        {/* "Not now" — a manager who has consciously parked something should be
            able to quiet it instead of being shouted at every day. */}
        <button
          onClick={() => setSnoozeOpen((v) => !v)}
          aria-expanded={snoozeOpen}
          title="Snooze this event"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-caption text-gray-400 hover:text-gold transition-colors"
        >
          <Clock size={11} />
        </button>
      </div>

      {snoozeOpen && (
        <div className="ml-[18px] mt-1.5 flex flex-wrap items-center gap-1">
          {SNOOZE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setSnoozeOpen(false); onSnooze(event, p.key); }}
              className="px-2 py-0.5 rounded-md border border-gray-200 bg-white text-caption text-gray-600 hover:text-gold hover:border-gold transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Same-day rollup ──────────────────────────────────────────────────────────

interface EventCluster {
  key: string;
  date: string;
  type: EventType;
  events: CalendarEvent[];
}

/**
 * Buckets the list by (date, type) so a portfolio-scale cluster — 50 rents
 * falling due on the 1st — reads as one line instead of fifty. Input is
 * already date-sorted, so bucket insertion order preserves it.
 */
function clusterEvents(events: CalendarEvent[]): EventCluster[] {
  const map = new Map<string, EventCluster>();
  for (const e of events) {
    const key = `${e.date}|${e.type}`;
    if (!map.has(key)) map.set(key, { key, date: e.date, type: e.type, events: [] });
    map.get(key)!.events.push(e);
  }
  return Array.from(map.values());
}

const URGENCY_RANK: Record<CalendarEvent["urgency"], number> = { ok: 0, warning: 1, critical: 2 };

function ClusterRow({
  cluster, onAction, actingOn, onSnooze,
}: {
  cluster: EventCluster;
  onAction: (e: CalendarEvent, a: CalendarAction) => void;
  actingOn: string | null;
  onSnooze: (e: CalendarEvent, preset: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = TYPE_CONFIG[cluster.type];
  const { events } = cluster;

  // The cluster inherits the worst urgency it contains, so a single overdue
  // rent inside a routine batch still surfaces at the summary line.
  const worst = events.reduce(
    (acc, e) => (URGENCY_RANK[e.urgency] > URGENCY_RANK[acc.urgency] ? e : acc),
    events[0]
  );

  const properties = Array.from(new Set(events.map((e) => e.propertyName)));
  const overdueCount = events.filter((e) => e.isOverdue).length;

  // Only total when every event shares one currency — a cross-currency sum
  // would be a meaningless number.
  const currencies = Array.from(new Set(events.map((e) => e.currency).filter(Boolean)));
  const total =
    currencies.length === 1 && events.every((e) => e.amount !== undefined)
      ? events.reduce((sum, e) => sum + (e.amount ?? 0), 0)
      : null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <p className="text-body text-gray-800">
              {events.length} {cfg.plural}
              {total !== null && (
                <span className="text-gray-500"> · {formatCurrency(total, currencies[0]!)}</span>
              )}
            </p>
            <p className="text-caption text-gray-400 mt-0.5 truncate">
              {properties.length === 1 ? properties[0] : `${properties.length} properties`}
              {overdueCount > 0 && (
                <span className="text-red-500"> · {overdueCount} overdue</span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={urgencyVariant(worst.urgency)}>{daysLabel(worst.daysUntil)}</Badge>
            {open
              ? <ChevronUp size={14} className="text-gray-400" />
              : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </div>
        <p className="text-caption text-gray-300 mt-1 ml-[18px]">
          {format(new Date(cluster.date + "T00:00:00"), "d MMM")} · tap to {open ? "collapse" : "see each one"}
        </p>
      </button>

      {open && (
        <div className="bg-gray-50/60 border-t border-gray-100 divide-y divide-gray-100">
          {events.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              onAction={onAction}
              busy={actingOn === e.id}
              onSnooze={onSnooze}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();

  // Shared with Dashboard / Income / Expenses so the working month survives
  // navigation, per the app-wide month convention.
  const [month, setMonth] = useSharedMonth();

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [filterReady, setFilterReady] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [overdueEvents, setOverdueEvents] = useState<CalendarEvent[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [snoozedCount, setSnoozedCount] = useState(0);
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [sources, setSources] = useState<CalendarSourceStatus[] | null>(null);
  const [view, setView] = useState<CalendarView>("month");
  // Anchor for week view — any date inside the week being shown.
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());

  const gridRef = useRef<HTMLDivElement>(null);

  const today = startOfDay(new Date());
  const year = month.getFullYear();
  const monthNum = month.getMonth() + 1;

  // Restore the type filter once on mount (hydration-safe).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FILTER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const valid = parsed.filter((t): t is EventType => t in TYPE_CONFIG);
        if (valid.length > 0) setActiveTypes(new Set(valid));
      }
    } catch { /* ignore */ }
    setFilterReady(true);
  }, []);

  useEffect(() => {
    if (!filterReady) return;
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(Array.from(activeTypes)));
    } catch { /* ignore */ }
  }, [activeTypes, filterReady]);

  // Week view spans month boundaries, so it asks for an explicit 7-day range
  // rather than the month the grid happens to be showing.
  const weekStart = useMemo(() => startOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor]);
  const weekEnd = useMemo(() => endOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  const rangeKey = view === "week"
    ? `from=${format(weekStart, "yyyy-MM-dd")}&to=${format(weekEnd, "yyyy-MM-dd")}`
    : `year=${year}&month=${monthNum}`;

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams(rangeKey);
    if (selectedId) params.set("propertyId", selectedId);
    if (includeSnoozed) params.set("includeSnoozed", "true");

    fetch(`/api/calendar?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then((d) => {
        setEvents(d.events ?? []);
        setOverdueEvents(d.overdueEvents ?? []);
        setOverdueTotal(d.overdueTotal ?? 0);
        setSources(d.sources ?? null);
        setSnoozedCount(d.snoozedCount ?? 0);
        setLoading(false);
      })
      .catch(() => {
        // A silent empty calendar reads as "nothing due" — say it failed.
        setFailed(true);
        setLoading(false);
      });
  }, [rangeKey, selectedId, includeSnoozed]);

  useEffect(() => { load(); }, [load]);

  // Restore the view choice once on mount (hydration-safe).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(VIEW_KEY);
      if (stored === "month" || stored === "week" || stored === "agenda") setView(stored);
    } catch { /* ignore */ }
  }, []);

  function changeView(next: CalendarView) {
    setView(next);
    try { sessionStorage.setItem(VIEW_KEY, next); } catch { /* ignore */ }
    // Entering week view, land on the week containing whatever the user was
    // last looking at rather than snapping back to today.
    if (next === "week") setWeekAnchor(selectedDay ?? (isSameMonth(month, today) ? today : month));
  }

  function goToMonth(next: Date) {
    setMonth(next);
    setSelectedDay(null);
  }

  function goToWeek(next: Date) {
    setWeekAnchor(next);
    setSelectedDay(null);
    // Keep the shared month in step, so switching back to Month lands where
    // you were rather than somewhere else.
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
  }

  function toggleType(t: EventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  /** Isolate a single type; pressing "only" again on the same type restores all. */
  function soloType(t: EventType) {
    setActiveTypes((prev) =>
      prev.size === 1 && prev.has(t) ? new Set(ALL_TYPES) : new Set([t])
    );
  }

  /**
   * Group chip: fully-on turns the whole bucket off, anything else turns it
   * fully on — so a partially-filtered group resolves to "show me all of this"
   * on first press rather than disappearing.
   */
  function toggleGroup(types: EventType[]) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      const allOn = types.every((t) => next.has(t));
      for (const t of types) {
        if (allOn) next.delete(t);
        else next.add(t);
      }
      return next;
    });
  }

  async function runAction(event: CalendarEvent, action: CalendarAction) {
    if (!action.endpoint) return;
    setActingOn(event.id);
    try {
      const r = await fetch(action.endpoint, {
        method: action.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body ?? {}),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : "Action failed");
      // send-reminders reports per-recipient failures without failing the call.
      if (Array.isArray(d?.failures) && d.failures.length > 0) {
        toast.error(d.failures[0]?.reason ?? "Couldn't send — tenant has no email address");
      } else {
        toast.success(`${action.label} — done`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActingOn(null);
    }
  }

  async function snoozeEvent(event: CalendarEvent, preset: string) {
    try {
      const r = await fetch("/api/calendar/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, until: preset }),
      });
      if (!r.ok) throw new Error();
      toast.success(preset === "dismiss" ? "Hidden from your calendar" : "Snoozed");
      load();
    } catch {
      toast.error("Couldn't snooze that");
    }
  }

  async function restoreAllSnoozed() {
    try {
      const r = await fetch("/api/calendar/snooze", { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Snoozed events restored");
      setIncludeSnoozed(false);
      load();
    } catch {
      toast.error("Couldn't restore");
    }
  }

  // ── Grid ─────────────────────────────────────────────────────────────────

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          activeTypes.has(e.type) &&
          (!mineOnly || (currentUserId != null && e.assigneeId === currentUserId))
      ),
    [events, activeTypes, mineOnly, currentUserId]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visibleEvents) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [visibleEvents]);

  const listEvents = useMemo(() => {
    if (!selectedDay) return visibleEvents;
    const key = format(selectedDay, "yyyy-MM-dd");
    return visibleEvents.filter((e) => e.date === key);
  }, [visibleEvents, selectedDay]);

  const listClusters = useMemo(() => clusterEvents(listEvents), [listEvents]);

  // Only populated when the server found the range genuinely empty.
  const unconfiguredSources = useMemo(
    () => (sources ?? []).filter((s) => !s.configured),
    [sources]
  );

  const visibleOverdue = useMemo(
    () => overdueEvents.filter((e) => activeTypes.has(e.type)),
    [overdueEvents, activeTypes]
  );

  // KPIs count what's actually on screen, so they can't contradict the grid.
  const criticalCount = visibleEvents.filter((e) => e.urgency === "critical").length;
  const warningCount = visibleEvents.filter((e) => e.urgency === "warning").length;

  const isViewingCurrentMonth = isSameMonth(month, today);

  /** Arrow-key navigation across the grid, as a date picker should have. */
  function onGridKeyDown(e: React.KeyboardEvent, day: Date) {
    const deltas: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    const delta = deltas[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
    setSelectedDay(next);
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${format(next, "yyyy-MM-dd")}"]`)
        ?.focus();
    });
  }

  return (
    <div>
      <Header
        title="Calendar"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      >
        <Link
          href="/settings/calendar"
          className="hidden sm:inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-2.5 py-1 rounded-lg text-body transition-colors"
          title="Subscribe in Google, Outlook or Apple Calendar"
        >
          <CalendarRange size={13} className="text-gold" />
          Subscribe
        </Link>
      </Header>

      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label={
              view === "week"
                ? `Shown this week`
                : `Shown in ${format(month, "MMM yyyy")}`
            }
            value={visibleEvents.length}
            icon={<CalendarDays size={20} />}
            colour="text-header"
            bg="bg-white border-gray-100 shadow-sm"
          />
          <KpiCard
            label={view === "week" ? "Critical this week" : "Critical this month"}
            value={criticalCount}
            icon={<AlertCircle size={20} />}
            colour={criticalCount > 0 ? "text-red-600" : "text-gray-400"}
            bg={criticalCount > 0 ? "bg-red-50 border-red-100 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
          <KpiCard
            label={view === "week" ? "Warnings this week" : "Warnings this month"}
            value={warningCount}
            icon={<AlertTriangle size={20} />}
            colour={warningCount > 0 ? "text-amber-600" : "text-gray-400"}
            bg={warningCount > 0 ? "bg-amber-50 border-amber-100 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
          <KpiCard
            label="Overdue (last 90 days)"
            value={overdueTotal}
            icon={<AlertCircle size={20} />}
            colour={overdueTotal > 0 ? "text-red-700" : "text-gray-400"}
            bg={overdueTotal > 0 ? "bg-red-50 border-red-200 shadow-sm" : "bg-white border-gray-100 shadow-sm"}
          />
        </div>

        {/* ── Fetch failure ─────────────────────────────────────────────── */}
        {failed && (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-body text-red-700">
              Couldn&apos;t load the calendar — this month may have events that aren&apos;t showing.
            </p>
            <button
              onClick={load}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-caption text-red-700 hover:bg-red-100 transition-colors"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {/* ── Overdue summary ───────────────────────────────────────────── */}
        {/* The Inbox is the queue for overdue work — it carries the real
            per-item actions. Re-rendering that queue here gave managers two
            places showing the same backlog with different affordances, so this
            reports the count, shows a taste, and hands over. */}
        {visibleOverdue.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-red-700">
                    {overdueTotal} overdue item{overdueTotal !== 1 ? "s" : ""} in the last 90 days
                  </p>
                  <p className="text-caption text-red-600/80 mt-0.5">
                    Work these from your Inbox — each one carries its own actions there.
                  </p>
                </div>
              </div>
              <Link
                href="/inbox"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-caption font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                <Inbox size={13} /> Open Inbox
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {visibleOverdue.slice(0, 3).map((e) => (
                <Link
                  key={e.id}
                  href={e.link}
                  title={`${e.title} — ${e.propertyName}`}
                  className="inline-flex items-center gap-1.5 max-w-full bg-white/70 border border-red-200 rounded-full px-2.5 py-1 text-caption text-gray-700 hover:border-red-400 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_CONFIG[e.type].dot}`} />
                  <span className="truncate max-w-[220px]">{e.title}</span>
                  <span className="text-red-600 font-medium shrink-0">
                    {Math.abs(e.daysUntil)}d
                  </span>
                </Link>
              ))}
              {overdueTotal > 3 && (
                <span className="text-caption text-red-600/70">
                  +{overdueTotal - 3} more in the Inbox
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Filters — four buckets, per-type behind "Refine" ───────────── */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {EVENT_GROUPS.map((g) => {
              const on = g.types.filter((t) => activeTypes.has(t));
              const state = on.length === g.types.length ? "all" : on.length === 0 ? "none" : "some";
              const count = events.filter((e) => g.types.includes(e.type)).length;
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => toggleGroup(g.types)}
                  aria-pressed={state !== "none"}
                  title={
                    state === "some"
                      ? `${g.label} — showing ${on.length} of ${g.types.length} types`
                      : g.label
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-caption font-medium transition-colors ${
                    state === "none"
                      ? BADGE_INACTIVE
                      : "bg-header text-white border-header"
                  }`}
                >
                  <Icon size={13} className={state === "none" ? "text-gray-300" : "text-gold"} />
                  {g.label}
                  {state === "some" && <span className="opacity-70">({on.length})</span>}
                  {count > 0 && (
                    <span className={state === "none" ? "opacity-60" : "opacity-70"}>{count}</span>
                  )}
                </button>
              );
            })}

            <button
              onClick={() => setRefineOpen((v) => !v)}
              aria-expanded={refineOpen}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-gray-200 text-caption text-gray-500 hover:text-gold hover:border-gold transition-colors"
            >
              <SlidersHorizontal size={12} />
              Refine
            </button>

            {/* Only case-backed work has an assignee, so this is deliberately
                labelled by what it does rather than "My week". */}
            {currentUserId && (
              <button
                onClick={() => setMineOnly((v) => !v)}
                aria-pressed={mineOnly}
                title="Cases, maintenance visits and approvals assigned to you"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-caption font-medium transition-colors ${
                  mineOnly
                    ? "bg-gold/15 text-gold-dark border-gold"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gold hover:text-gold"
                }`}
              >
                <UserCheck size={13} />
                Assigned to me
              </button>
            )}

            {activeTypes.size !== ALL_TYPES.length && (
              <button
                onClick={() => setActiveTypes(new Set(ALL_TYPES))}
                className="text-caption text-gold hover:underline px-1"
              >
                Show everything
              </button>
            )}

            {snoozedCount > 0 && (
              <button
                onClick={() => setIncludeSnoozed((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 text-caption text-gray-400 hover:text-gold hover:border-gold transition-colors"
              >
                <BellOff size={12} />
                {includeSnoozed
                  ? `Hide ${snoozedCount} snoozed`
                  : `${snoozedCount} snoozed`}
              </button>
            )}

            {includeSnoozed && snoozedCount > 0 && (
              <button
                onClick={restoreAllSnoozed}
                className="text-caption text-gold hover:underline px-1"
              >
                Restore all
              </button>
            )}
          </div>

          {refineOpen && (
            <div className="flex flex-wrap items-center gap-2 pl-1 pt-1 border-t border-gray-100">
              {ALL_TYPES.map((t) => {
                const cfg = TYPE_CONFIG[t];
                const active = activeTypes.has(t);
                const count = events.filter((e) => e.type === t).length;
                return (
                  <span key={t} className="inline-flex items-center">
                    <button
                      onClick={() => toggleType(t)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-l-full border text-caption font-medium transition-colors ${
                        active ? cfg.badge : BADGE_INACTIVE
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${active ? cfg.dot : "bg-gray-300"}`} />
                      {cfg.label}
                      {count > 0 && <span className="opacity-60">{count}</span>}
                    </button>
                    {/* Explicit control — the old double-click-to-isolate was
                        hidden in a title attribute and effectively undiscoverable. */}
                    <button
                      onClick={() => soloType(t)}
                      title={`Show only ${cfg.label}`}
                      className={`px-1.5 py-1 rounded-r-full border border-l-0 text-caption transition-colors ${
                        active ? cfg.badge : BADGE_INACTIVE
                      } hover:text-gold`}
                    >
                      only
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* ── View switch ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.key}
                  onClick={() => changeView(v.key)}
                  aria-pressed={view === v.key}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption transition-colors ${
                    view === v.key ? "bg-white text-header shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon size={13} />
                  {v.label}
                </button>
              );
            })}
          </div>

          {view === "week" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToWeek(subWeeks(weekAnchor, 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                aria-label="Previous week"
              >
                <ChevronLeft size={16} />
              </button>
              <span className=" text-body text-gray-700 px-1">
                {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
              </span>
              {!isSameWeek(weekAnchor, today, { weekStartsOn: 1 }) && (
                <button
                  onClick={() => goToWeek(new Date())}
                  className="px-2 py-0.5 rounded-md border border-gray-200 text-caption text-gray-500 hover:text-gold hover:border-gold transition-colors"
                >
                  This week
                </button>
              )}
              <button
                onClick={() => goToWeek(addWeeks(weekAnchor, 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                aria-label="Next week"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div
            className={
              view === "month"
                ? "grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4"
                : "space-y-4"
            }
          >

            {/* ── Month grid ────────────────────────────────────────────── */}
            <div
              className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden ${
                view === "month" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100">
                <button
                  onClick={() => goToMonth(subMonths(month, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                  <h2 className=" text-h3 text-gray-900">{format(month, "MMMM yyyy")}</h2>
                  {!isViewingCurrentMonth && (
                    <button
                      onClick={() => goToMonth(startOfMonth(new Date()))}
                      className="px-2 py-0.5 rounded-md border border-gray-200 text-caption text-gray-500 hover:text-gold hover:border-gold transition-colors"
                    >
                      Today
                    </button>
                  )}
                </div>
                <button
                  onClick={() => goToMonth(addMonths(month, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-gray-100">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-2 text-center text-caption font-medium text-gray-400">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7" ref={gridRef}>
                {gridDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, month);
                  const isToday = isSameDay(day, today);
                  const isSelected = selectedDay !== null && isSameDay(day, selectedDay);
                  // Dots represent distinct types; the overflow count is the
                  // number of events those dots don't individually stand for.
                  const dotTypes = Array.from(new Set(dayEvents.map((e) => e.type))).slice(0, 4);
                  const hiddenCount = dayEvents.length - dotTypes.length;

                  // Type dots say WHAT is happening; the cell's shading says how
                  // much it matters, so a day that will hurt you is visible
                  // while scanning instead of only after clicking into it.
                  const worstRank = dayEvents.reduce(
                    (max, e) => Math.max(max, URGENCY_RANK[e.urgency]),
                    -1
                  );
                  const critical = worstRank === 2;
                  const warning = worstRank === 1;
                  const attention = dayEvents.filter((e) => e.urgency !== "ok").length;

                  const cellTone = isSelected
                    ? "bg-gold/10"
                    : critical
                    ? "bg-red-50 hover:bg-red-100/70"
                    : warning
                    ? "bg-amber-50/70 hover:bg-amber-100/60"
                    : inMonth
                    ? "hover:bg-gray-50"
                    : "bg-gray-50/40 hover:bg-gray-100/50";

                  return (
                    <button
                      key={key}
                      data-day={key}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      onKeyDown={(e) => onGridKeyDown(e, day)}
                      aria-current={isToday ? "date" : undefined}
                      aria-pressed={isSelected}
                      // Colour alone can't carry severity — say it in the label too.
                      aria-label={
                        `${format(day, "d MMMM yyyy")}, ${dayEvents.length} event${dayEvents.length !== 1 ? "s" : ""}` +
                        (attention > 0 ? `, ${attention} needing attention` : "")
                      }
                      className={`min-h-[72px] p-1.5 border-b border-r border-gray-50 flex flex-col items-start gap-1 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-inset ${cellTone}`}
                    >
                      <span
                        className={`w-6 h-6 flex items-center justify-center rounded-full text-caption ${
                          isToday
                            ? "bg-header text-white font-medium"
                            : isSelected
                            ? "bg-gold text-white font-medium"
                            : critical
                            ? "text-red-700 font-semibold ring-1 ring-red-300"
                            : warning
                            ? "text-amber-800 font-semibold"
                            : inMonth
                            ? "text-gray-700 font-medium"
                            : "text-gray-300 font-medium"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dotTypes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-0.5 px-0.5">
                          {dotTypes.map((t) => (
                            <span
                              key={t}
                              className={`w-1.5 h-1.5 rounded-full ${TYPE_CONFIG[t].dot}`}
                              title={TYPE_CONFIG[t].label}
                            />
                          ))}
                          {hiddenCount > 0 && (
                            <span className="text-label text-gray-400 ">
                              +{hiddenCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Shading is only useful if you know what it means. */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-caption text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-50 border border-red-300" />
                  Overdue or critical
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />
                  Due soon
                </span>
                <span className="hidden sm:inline text-gray-300">
                  Dots show what kind of event
                </span>
              </div>
            </div>

            {/* ── Week columns ──────────────────────────────────────────── */}
            {/* All events are all-day, so a time-axis week grid would be
                misleading — seven stacked day columns is the honest shape. */}
            {view === "week" && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                  {weekDays.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const dayEvents = visibleEvents.filter((e) => e.date === key);
                    const isToday = isSameDay(day, today);
                    const worstRank = dayEvents.reduce(
                      (max, e) => Math.max(max, URGENCY_RANK[e.urgency]),
                      -1
                    );

                    return (
                      <div key={key} className="min-h-[120px] md:min-h-[420px] flex flex-col">
                        <div
                          className={`px-3 py-2 border-b border-gray-100 sticky top-0 ${
                            worstRank === 2
                              ? "bg-red-50"
                              : worstRank === 1
                              ? "bg-amber-50/70"
                              : isToday
                              ? "bg-header/5"
                              : "bg-white"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-label uppercase text-gray-400">
                              {format(day, "EEE")}
                            </span>
                            <span
                              className={`text-body ${
                                isToday ? "font-semibold text-header" : "text-gray-700"
                              }`}
                            >
                              {format(day, "d")}
                            </span>
                          </div>
                          {dayEvents.length > 0 && (
                            <p className="text-caption text-gray-400 mt-0.5">
                              {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>

                        <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
                          {dayEvents.length === 0 ? (
                            <p className="text-caption text-gray-300 px-1 py-2">—</p>
                          ) : (
                            dayEvents.map((e) => {
                              const cfg = TYPE_CONFIG[e.type];
                              return (
                                <Link
                                  key={e.id}
                                  href={e.link}
                                  title={`${e.title} — ${e.propertyName}`}
                                  className={`block rounded-lg border px-2 py-1.5 hover:shadow-sm transition-shadow ${
                                    e.urgency === "critical"
                                      ? "border-red-200 bg-red-50/60"
                                      : e.urgency === "warning"
                                      ? "border-amber-200 bg-amber-50/60"
                                      : "border-gray-200 bg-gray-50/60"
                                  }`}
                                >
                                  <div className="flex items-start gap-1.5">
                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                    <span className="text-caption text-gray-800 line-clamp-3">
                                      {e.title}
                                    </span>
                                  </div>
                                  <p className="text-caption text-gray-400 mt-0.5 truncate">
                                    {e.unitName ? `Unit ${e.unitName}` : e.propertyName}
                                  </p>
                                </Link>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Events list ───────────────────────────────────────────── */}
            <div
              className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col ${
                view === "week" ? "hidden" : ""
              }`}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <h3 className=" font-medium text-body text-gray-800 truncate">
                  {selectedDay
                    ? format(selectedDay, "d MMMM yyyy")
                    : `All events — ${format(month, "MMMM yyyy")}`}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedDay && (
                    <button
                      onClick={() => setSelectedDay(null)}
                      className="text-caption text-gold hover:underline "
                    >
                      Whole month
                    </button>
                  )}
                  <span className="text-caption text-gray-400 ">
                    {listEvents.length}
                  </span>
                </div>
              </div>

              {listEvents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 px-5 text-center">
                  {/* Three different empty states, because "no events" has
                      three different causes and they need different answers. */}
                  {mineOnly ? (
                    <>
                      <p className="text-body text-gray-500">
                        Nothing here is assigned to you.
                      </p>
                      <p className="text-caption text-gray-400 mt-1.5 max-w-xs">
                        Only cases, maintenance visits and approvals carry an assignee.
                        Leases, rent and compliance are property-wide, so they never
                        show under this filter.
                      </p>
                      <button
                        onClick={() => setMineOnly(false)}
                        className="mt-2 text-caption text-gold hover:underline "
                      >
                        Show everyone&apos;s
                      </button>
                    </>
                  ) : activeTypes.size !== ALL_TYPES.length ? (
                    <>
                      <p className="text-body text-gray-500">
                        Nothing matches the filters you&apos;ve got on.
                      </p>
                      <button
                        onClick={() => setActiveTypes(new Set(ALL_TYPES))}
                        className="mt-2 text-caption text-gold hover:underline "
                      >
                        Show everything
                      </button>
                    </>
                  ) : selectedDay ? (
                    <p className="text-body text-gray-400">Nothing on this day.</p>
                  ) : unconfiguredSources.length > 0 ? (
                    <div className="w-full text-left">
                      <p className="text-body text-gray-700">
                        Nothing scheduled in {format(month, "MMMM yyyy")}.
                      </p>
                      <p className="text-caption text-gray-500 mt-2 flex items-start gap-1.5">
                        <Settings2 size={13} className="text-gold shrink-0 mt-0.5" />
                        <span>
                          Some of what fills this calendar isn&apos;t set up yet, so those
                          dates can&apos;t appear at all:
                        </span>
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {unconfiguredSources.map((s) => (
                          <li key={s.key}>
                            <Link
                              href={s.href}
                              className="flex items-start gap-2 rounded-lg border border-gray-100 px-2.5 py-2 hover:border-gold hover:bg-gold/5 transition-colors group"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 mt-1.5 group-hover:bg-gold" />
                              <span className="min-w-0">
                                <span className="block text-caption text-gray-700">
                                  No {s.label.toLowerCase()}
                                </span>
                                <span className="block text-caption text-gray-400">
                                  Powers {s.powers}
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 size={22} className="text-green-500 mb-2" />
                      <p className="text-body text-gray-600">
                        Nothing due in {format(month, "MMMM yyyy")}.
                      </p>
                      <p className="text-caption text-gray-400 mt-1">
                        Your calendar is set up and this month is clear.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-[70vh]">
                  {listClusters.map((c) =>
                    c.events.length >= ROLLUP_MIN ? (
                      <ClusterRow
                        key={c.key}
                        cluster={c}
                        onAction={runAction}
                        actingOn={actingOn}
                        onSnooze={snoozeEvent}
                      />
                    ) : (
                      c.events.map((e) => (
                        <EventRow
                          key={e.id}
                          event={e}
                          onAction={runAction}
                          busy={actingOn === e.id}
                          onSnooze={snoozeEvent}
                        />
                      ))
                    )
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
