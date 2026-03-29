"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays, BarChart2, RefreshCw, Loader2, Plus, CheckCircle2,
  TrendingUp, Moon, BedDouble, DollarSign, ChevronLeft, ChevronRight,
  Wrench,
} from "lucide-react";
import { getDaysInMonth, format, addMonths, subMonths, startOfDay } from "date-fns";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKSh } from "@/lib/currency";
import { calcOccupancyRate } from "@/lib/calculations";
import { formatDate } from "@/lib/date-utils";
import { useProperty } from "@/lib/property-context";
import toast from "react-hot-toast";
import { clsx } from "clsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_COLOURS: Record<string, string> = {
  AIRBNB:      "bg-rose-400",
  BOOKING_COM: "bg-blue-400",
  DIRECT:      "bg-emerald-400",
  AGENT:       "bg-amber-400",
};
const PLATFORM_LABELS: Record<string, string> = {
  AIRBNB: "Airbnb", BOOKING_COM: "Booking.com", DIRECT: "Direct", AGENT: "Agent",
};

type Tab = "calendar" | "dashboard" | "turnovers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function nightsBetween(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function avgNightlyRate(entries: any[]): number {
  let total = 0; let count = 0;
  for (const e of entries) {
    if (!e.checkIn || !e.checkOut) continue;
    const nights = nightsBetween(e.checkIn, e.checkOut);
    if (nights <= 0) continue;
    const rate = e.nightlyRate ?? Math.round(e.grossAmount / nights);
    total += rate; count++;
  }
  return count > 0 ? Math.round(total / count) : 0;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AirbnbPage() {
  const { selectedId } = useProperty();
  const [tab, setTab]   = useState<Tab>("calendar");
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // Data
  const [properties, setProperties]     = useState<any[]>([]);
  const [entries, setEntries]           = useState<any[]>([]);   // month entries
  const [allEntries, setAllEntries]     = useState<any[]>([]);   // all-time for turnovers
  const [cleaningJobs, setCleaningJobs] = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [creatingJob, setCreatingJob]   = useState<string | null>(null); // entryId being processed

  // ── Fetch properties ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then(setProperties);
  }, []);

  // ── Airbnb properties visible to user ─────────────────────────────────────
  const airbnbProperties = useMemo(
    () => properties.filter((p: any) => p.type === "AIRBNB" && (!selectedId || p.id === selectedId)),
    [properties, selectedId],
  );

  const airbnbPropertyIds = useMemo(() => airbnbProperties.map((p: any) => p.id), [airbnbProperties]);

  // ── Fetch month entries ────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    if (airbnbPropertyIds.length === 0) { setEntries([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(month.getFullYear()),
        month: String(month.getMonth() + 1),
        type: "AIRBNB",
        ...(selectedId ? { propertyId: selectedId } : {}),
      });
      const data = await fetch(`/api/income?${params}`).then((r) => r.json());
      setEntries(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [month, selectedId, airbnbPropertyIds]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── Fetch all entries + cleaning jobs for Turnovers tab ───────────────────
  useEffect(() => {
    if (tab !== "turnovers" || airbnbPropertyIds.length === 0) return;
    const propParam = selectedId ? `&propertyId=${selectedId}` : "";
    Promise.all([
      fetch(`/api/income?type=AIRBNB${propParam}`).then((r) => r.json()),
      fetch(`/api/maintenance?category=CLEANING${propParam}`).then((r) => r.json()),
    ]).then(([inc, jobs]) => {
      setAllEntries(Array.isArray(inc) ? inc : []);
      setCleaningJobs(Array.isArray(jobs) ? jobs : []);
    });
  }, [tab, selectedId, airbnbPropertyIds]);

  // ── KPI computations ──────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(month);
  const airbnbEntries = entries.filter((e: any) => e.checkIn && e.checkOut);

  // per-unit data
  const allUnits = useMemo(
    () => airbnbProperties.flatMap((p: any) => (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name }))),
    [airbnbProperties],
  );

  const unitStats = useMemo(() =>
    allUnits.map((u: any) => {
      const ue = airbnbEntries.filter((e: any) => e.unitId === u.id);
      const nights = ue.reduce((s: number, e: any) => s + (e.checkIn && e.checkOut ? nightsBetween(e.checkIn, e.checkOut) : 0), 0);
      const gross   = ue.reduce((s: number, e: any) => s + e.grossAmount, 0);
      const comm    = ue.reduce((s: number, e: any) => s + e.agentCommission, 0);
      const occ     = daysInMonth > 0 ? Math.min(nights / daysInMonth, 1) : 0;
      const avgRate = avgNightlyRate(ue);
      return { unit: u, entries: ue, nights, gross, comm, net: gross - comm, occ, avgRate, count: ue.length };
    }),
    [allUnits, airbnbEntries, daysInMonth],
  );

  const kpi = useMemo(() => {
    const totalGross    = unitStats.reduce((s, u) => s + u.gross, 0);
    const totalNights   = unitStats.reduce((s, u) => s + u.nights, 0);
    const totalBookings = unitStats.reduce((s, u) => s + u.count, 0);
    const avgOcc        = unitStats.length > 0 ? unitStats.reduce((s, u) => s + u.occ, 0) / unitStats.length : 0;
    const avgRate       = avgNightlyRate(airbnbEntries);
    const revPAR        = allUnits.length > 0 && daysInMonth > 0 ? totalGross / (allUnits.length * daysInMonth) : 0;
    const avgStay       = totalBookings > 0 ? totalNights / totalBookings : 0;
    return { totalGross, totalNights, totalBookings, avgOcc, avgRate, revPAR, avgStay };
  }, [unitStats, airbnbEntries, allUnits, daysInMonth]);

  // ── Turnovers ─────────────────────────────────────────────────────────────
  const today = startOfDay(new Date());
  const in14  = new Date(today.getTime() + 14 * 86400000);

  const upcomingTurnovers = useMemo(() => {
    return allEntries
      .filter((e: any) => {
        if (!e.checkOut) return false;
        const co = startOfDay(new Date(e.checkOut));
        return co >= today && co <= in14;
      })
      .sort((a: any, b: any) => new Date(a.checkOut).getTime() - new Date(b.checkOut).getTime());
  }, [allEntries]);

  function hasCleaningJob(entry: any): boolean {
    if (!entry.checkOut) return false;
    const coDate = format(new Date(entry.checkOut), "yyyy-MM-dd");
    return cleaningJobs.some(
      (j: any) =>
        j.unitId === entry.unitId &&
        j.scheduledDate &&
        format(new Date(j.scheduledDate), "yyyy-MM-dd") === coDate,
    );
  }

  async function createTurnoverJob(entry: any) {
    setCreatingJob(entry.id);
    try {
      const unitLabel = entry.unit?.unitNumber ?? "Unit";
      const coLabel   = format(new Date(entry.checkOut), "d MMM yyyy");
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId:    entry.unit?.property?.id ?? entry.unit?.propertyId,
          unitId:        entry.unitId,
          title:         `Turnover — ${unitLabel} (checkout ${coLabel})`,
          category:      "CLEANING",
          priority:      "HIGH",
          scheduledDate: format(new Date(entry.checkOut), "yyyy-MM-dd"),
          description:   "Post-stay cleaning and linen changeover",
        }),
      });
      if (res.ok) {
        const job = await res.json();
        setCleaningJobs((prev) => [...prev, job]);
        toast.success("Turnover task created");
      } else {
        toast.error("Failed to create task");
      }
    } finally {
      setCreatingJob(null);
    }
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────
  function getBookingSpan(entry: any, days: number) {
    if (!entry.checkIn || !entry.checkOut) return null;
    const ci = startOfDay(new Date(entry.checkIn));
    const co = startOfDay(new Date(entry.checkOut));
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd   = new Date(month.getFullYear(), month.getMonth(), days);

    const spanStart = ci < monthStart ? monthStart : ci;
    const spanEnd   = co > monthEnd   ? new Date(month.getFullYear(), month.getMonth(), days + 1) : co;
    if (spanStart >= spanEnd) return null;

    const startDay = spanStart.getDate(); // 1-indexed
    const endDay   = spanEnd.getDate();   // exclusive day
    return { startDay, endDay, nights: nightsBetween(spanStart, spanEnd) };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-cream">
      <Header title="Airbnb" />
      <div className="page-container space-y-5">

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm w-fit">
          {([
            { key: "calendar",   label: "Calendar",   icon: CalendarDays },
            { key: "dashboard",  label: "Dashboard",  icon: BarChart2 },
            { key: "turnovers",  label: "Turnovers",  icon: Wrench },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
                tab === key ? "bg-gold text-white shadow-sm" : "text-gray-500 hover:text-header"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Month picker (calendar + dashboard only) */}
        {tab !== "turnovers" && (
          <div className="flex items-center justify-between">
            <MonthPicker value={month} onChange={setMonth} />
            <button onClick={fetchEntries} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-header font-sans transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        )}

        {airbnbProperties.length === 0 ? (
          <EmptyState title="No Airbnb properties" description="Switch to an Airbnb property to view this page" icon={<CalendarDays size={40} />} />
        ) : loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            {/* ════════════════════════ CALENDAR TAB ════════════════════════ */}
            {tab === "calendar" && (
              <Card padding="none">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-display text-header">
                    Occupancy Calendar — {format(month, "MMMM yyyy")}
                  </p>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-1.5">
                    {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1.5 text-xs font-sans text-gray-500">
                        <span className={`w-2.5 h-2.5 rounded-sm ${PLATFORM_COLOURS[k] ?? "bg-gray-300"}`} />
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[900px] p-4">
                    {/* Day headers */}
                    <div className="grid mb-2" style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, 1fr)` }}>
                      <div />
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                        <div key={d} className={clsx(
                          "text-center text-xs font-sans font-medium py-1",
                          startOfDay(new Date(month.getFullYear(), month.getMonth(), d)).getTime() === today.getTime()
                            ? "text-gold bg-amber-50 rounded"
                            : "text-gray-400",
                        )}>{d}</div>
                      ))}
                    </div>

                    {/* Unit rows */}
                    {allUnits.map((unit: any) => {
                      const unitEntries = entries.filter((e: any) => e.unitId === unit.id && e.checkIn && e.checkOut);
                      return (
                        <div key={unit.id} className="grid items-center mb-1.5 relative" style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, 1fr)`, minHeight: "36px" }}>
                          {/* Unit label */}
                          <div className="text-xs font-mono font-medium text-gray-600 pr-2 truncate">{unit.unitNumber}</div>

                          {/* Day cells (background) */}
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                            <div key={d} className="h-8 border-l border-gray-100 bg-gray-50/50" />
                          ))}

                          {/* Booking bars (absolutely positioned over the grid) */}
                          {unitEntries.map((entry: any) => {
                            const span = getBookingSpan(entry, daysInMonth);
                            if (!span) return null;
                            const colour = PLATFORM_COLOURS[entry.platform ?? ""] ?? "bg-gold";
                            // Calculate left/width as percentage of the day columns
                            const colW = 100 / daysInMonth;
                            const left = `calc(120px + ${(span.startDay - 1) * colW}%)`;
                            const width = `${span.nights * colW}%`;
                            const guests = entry.bookingGuests ?? [];
                            const primaryGuest = guests.find((g: any) => g.isPrimary)?.guest ?? guests[0]?.guest;
                            return (
                              <div
                                key={entry.id}
                                title={`${primaryGuest?.name ?? "Guest"} · ${span.nights}n · ${formatKSh(entry.grossAmount)}`}
                                className={clsx(
                                  "absolute top-1 h-6 rounded-md flex items-center px-2 cursor-pointer text-white text-xs font-sans font-medium truncate shadow-sm transition-opacity hover:opacity-80",
                                  colour,
                                )}
                                style={{ left, width, maxWidth: width }}
                              >
                                {span.nights > 1 && (primaryGuest?.name ?? PLATFORM_LABELS[entry.platform ?? ""] ?? "")}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {allUnits.length === 0 && (
                      <p className="text-sm text-gray-400 font-sans text-center py-8">No units found for this Airbnb property.</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ════════════════════════ DASHBOARD TAB ══════════════════════ */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                {/* KPI cards */}
                <div className="grid grid-cols-5 gap-3">
                  <Card padding="sm">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Occupancy</p>
                    <p className={`text-2xl font-display mt-1 ${kpi.avgOcc >= 0.8 ? "text-income" : kpi.avgOcc >= 0.5 ? "text-amber-600" : "text-expense"}`}>
                      {Math.round(kpi.avgOcc * 100)}%
                    </p>
                    <p className="text-xs text-gray-400 font-sans mt-0.5">{kpi.totalNights} nights booked</p>
                  </Card>
                  <Card padding="sm">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Avg Nightly Rate</p>
                    <CurrencyDisplay amount={kpi.avgRate} size="lg" className="block mt-1 text-header" />
                    <p className="text-xs text-gray-400 font-sans mt-0.5">per night</p>
                  </Card>
                  <Card padding="sm">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">RevPAR</p>
                    <CurrencyDisplay amount={kpi.revPAR} size="lg" className="block mt-1 text-header" />
                    <p className="text-xs text-gray-400 font-sans mt-0.5">revenue / available room / night</p>
                  </Card>
                  <Card padding="sm">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Avg Stay</p>
                    <p className="text-2xl font-display text-header mt-1">{kpi.avgStay > 0 ? kpi.avgStay.toFixed(1) : "—"}</p>
                    <p className="text-xs text-gray-400 font-sans mt-0.5">nights avg</p>
                  </Card>
                  <Card padding="sm">
                    <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Total Bookings</p>
                    <p className="text-2xl font-display text-header mt-1">{kpi.totalBookings}</p>
                    <CurrencyDisplay amount={kpi.totalGross} size="sm" className="block text-income mt-0.5" />
                  </Card>
                </div>

                {/* Per-unit breakdown */}
                {unitStats.length > 0 && (
                  <Card padding="none">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <h3 className="section-header">Per-Unit Breakdown — {format(month, "MMMM yyyy")}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px]">
                        <thead className="bg-cream-dark">
                          <tr>
                            {["Unit", "Bookings", "Booked Nights", "Occupancy", "Gross Revenue", "Net (after comm.)", "Avg Nightly Rate"].map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {unitStats.map(({ unit, count, nights, gross, net, occ, avgRate }) => (
                            <tr key={unit.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                              <td className="px-4 py-3 text-sm font-mono font-medium text-header">{unit.unitNumber}</td>
                              <td className="px-4 py-3 text-sm font-sans text-gray-500 text-center">{count}</td>
                              <td className="px-4 py-3 text-sm font-sans text-gray-600 text-center">{nights}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${occ >= 0.8 ? "bg-income" : occ >= 0.5 ? "bg-amber-400" : "bg-expense"}`} style={{ width: `${Math.round(occ * 100)}%` }} />
                                  </div>
                                  <span className="text-xs font-sans text-gray-600">{Math.round(occ * 100)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right"><CurrencyDisplay amount={gross} size="sm" className="text-income" /></td>
                              <td className="px-4 py-3 text-right"><CurrencyDisplay amount={net} size="sm" className={net >= 0 ? "text-header" : "text-expense"} /></td>
                              <td className="px-4 py-3 text-right">
                                {avgRate > 0 ? <CurrencyDisplay amount={avgRate} size="sm" className="text-gray-600" /> : <span className="text-xs text-gray-400 font-sans">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {airbnbEntries.length === 0 && (
                  <EmptyState title="No bookings" description={`No Airbnb bookings recorded for ${format(month, "MMMM yyyy")}`} icon={<BedDouble size={40} />} />
                )}
              </div>
            )}

            {/* ════════════════════════ TURNOVERS TAB ══════════════════════ */}
            {tab === "turnovers" && (
              <div className="space-y-4">
                {/* Upcoming turnovers */}
                <Card>
                  <h3 className="section-header mb-4">Upcoming Check-outs (next 14 days)</h3>
                  {upcomingTurnovers.length === 0 ? (
                    <p className="text-sm text-gray-400 font-sans text-center py-6">No check-outs in the next 14 days.</p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingTurnovers.map((entry: any) => {
                        const jobExists = hasCleaningJob(entry);
                        const isCreating = creatingJob === entry.id;
                        const nights = entry.checkIn && entry.checkOut ? nightsBetween(entry.checkIn, entry.checkOut) : null;
                        const daysUntil = Math.round((startOfDay(new Date(entry.checkOut)).getTime() - today.getTime()) / 86400000);
                        const primaryGuest = (entry.bookingGuests ?? []).find((g: any) => g.isPrimary)?.guest ?? (entry.bookingGuests ?? [])[0]?.guest;
                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={clsx("w-1 self-stretch rounded-full shrink-0", daysUntil === 0 ? "bg-expense" : daysUntil <= 2 ? "bg-amber-400" : "bg-gray-200")} />
                              <div>
                                <p className="text-sm font-medium font-sans text-header">
                                  {entry.unit?.unitNumber}
                                  <span className="ml-2 text-xs font-normal text-gray-400">{entry.unit?.property?.name}</span>
                                </p>
                                <p className="text-xs text-gray-500 font-sans">
                                  Check-out: <span className="font-medium text-gray-700">{formatDate(entry.checkOut)}</span>
                                  {nights && <span className="ml-2">· {nights} nights</span>}
                                  {primaryGuest && <span className="ml-2">· {primaryGuest.name}</span>}
                                </p>
                                <p className="text-xs font-sans mt-0.5">
                                  {daysUntil === 0 ? (
                                    <span className="text-expense font-medium">Today</span>
                                  ) : daysUntil === 1 ? (
                                    <span className="text-amber-600 font-medium">Tomorrow</span>
                                  ) : (
                                    <span className="text-gray-400">In {daysUntil} days</span>
                                  )}
                                  {entry.platform && (
                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-white text-xs ${PLATFORM_COLOURS[entry.platform] ?? "bg-gray-400"}`}>
                                      {PLATFORM_LABELS[entry.platform]}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {jobExists ? (
                                <span className="flex items-center gap-1.5 text-xs text-income font-sans font-medium">
                                  <CheckCircle2 size={14} /> Task Created
                                </span>
                              ) : (
                                <button
                                  disabled={isCreating}
                                  onClick={() => createTurnoverJob(entry)}
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-white rounded-lg font-sans font-medium hover:bg-gold-dark transition-colors disabled:opacity-50"
                                >
                                  {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                  Create Turnover Task
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Cleaning job log */}
                <Card padding="none">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="section-header">Turnover Log</h3>
                  </div>
                  {cleaningJobs.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-2 text-gray-400">
                      <Wrench size={28} className="opacity-30" />
                      <p className="text-sm font-sans">No cleaning tasks logged yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[540px]">
                        <thead className="bg-cream-dark">
                          <tr>
                            {["Unit", "Title", "Scheduled", "Assigned To", "Status"].map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...cleaningJobs]
                            .sort((a, b) => (a.scheduledDate ? -1 : 1) || new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
                            .map((job: any) => (
                              <tr key={job.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{job.unit?.unitNumber ?? "—"}</td>
                                <td className="px-4 py-3 text-sm font-sans text-header">{job.title}</td>
                                <td className="px-4 py-3 text-sm font-sans text-gray-500">
                                  {job.scheduledDate ? formatDate(job.scheduledDate) : "—"}
                                </td>
                                <td className="px-4 py-3 text-sm font-sans text-gray-500">{job.assignedTo ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={
                                    job.status === "DONE" ? "green" :
                                    job.status === "IN_PROGRESS" ? "blue" :
                                    job.status === "OPEN" ? "amber" : "gray"
                                  }>
                                    {job.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
