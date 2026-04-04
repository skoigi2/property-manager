"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  CalendarDays, BarChart2, Wrench, RefreshCw, Loader2, Plus, CheckCircle2,
  BedDouble, X, Trash2, Pencil, Users,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { getDaysInMonth, format, startOfDay } from "date-fns";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GuestPanel } from "@/components/guests/GuestPanel";
import { formatCurrency } from "@/lib/currency";
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
const AGENTS = ["Maggie", "Audrey", "Brenda", "Koka", "Other"];

type Tab = "calendar" | "dashboard" | "turnovers";

interface BookingForm {
  unitId: string;
  checkIn: string;
  checkOut: string;
  nightlyRate: string;
  grossAmount: string;
  platform: string;
  agentName: string;
  agentCommission: string;
  note: string;
}

const EMPTY_FORM: BookingForm = {
  unitId: "", checkIn: "", checkOut: "",
  nightlyRate: "", grossAmount: "",
  platform: "AIRBNB", agentName: "",
  agentCommission: "0", note: "",
};

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
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "USD";
  const [tab, setTab]     = useState<Tab>("calendar");
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // Data
  const [properties, setProperties]     = useState<any[]>([]);
  const [entries, setEntries]           = useState<any[]>([]);   // month entries
  const [allEntries, setAllEntries]     = useState<any[]>([]);   // all-time for turnovers
  const [cleaningJobs, setCleaningJobs] = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [creatingJob, setCreatingJob]   = useState<string | null>(null);

  // Booking form
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState<BookingForm>(EMPTY_FORM);
  const [submitting, setSubmitting]     = useState(false);

  // Booking detail panel
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [editingEntry, setEditingEntry]   = useState(false);
  const [editForm, setEditForm]           = useState<Partial<BookingForm>>({});
  const [savingEdit, setSavingEdit]       = useState(false);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [showGuests, setShowGuests]       = useState(false);

  // ── Fetch properties ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then(setProperties);
  }, []);

  const airbnbProperties = useMemo(
    () => properties.filter((p: any) => p.type === "AIRBNB" && (!selectedId || p.id === selectedId)),
    [properties, selectedId],
  );
  const airbnbPropertyIds = useMemo(() => airbnbProperties.map((p: any) => p.id), [airbnbProperties]);
  const allUnits = useMemo(
    () => airbnbProperties.flatMap((p: any) => (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name, propertyId: p.id }))),
    [airbnbProperties],
  );

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

  // ── Fetch all entries + cleaning jobs for Turnovers ───────────────────────
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

  // ── Today's booking status ─────────────────────────────────────────────────
  const today = startOfDay(new Date());

  const todayStatus = useMemo(() =>
    allUnits.map((u: any) => {
      const booking = entries.find((e: any) => {
        if (e.unitId !== u.id || !e.checkIn || !e.checkOut) return false;
        const ci = startOfDay(new Date(e.checkIn));
        const co = startOfDay(new Date(e.checkOut));
        return ci <= today && co > today;
      });
      return { unit: u, booking };
    }),
    [allUnits, entries, today],
  );

  // ── KPI computations ──────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(month);
  const airbnbEntries = entries.filter((e: any) => e.checkIn && e.checkOut);

  const unitStats = useMemo(() =>
    allUnits.map((u: any) => {
      const ue      = airbnbEntries.filter((e: any) => e.unitId === u.id);
      const nights  = ue.reduce((s: number, e: any) => s + nightsBetween(e.checkIn, e.checkOut), 0);
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

  // ── New Booking form ──────────────────────────────────────────────────────

  function setFormField<K extends keyof BookingForm>(key: K, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-compute nights/gross/nightly rate
      if (next.checkIn && next.checkOut) {
        const nights = nightsBetween(next.checkIn, next.checkOut);
        if (nights > 0) {
          if (key === "nightlyRate" && value) {
            const gross = Math.round(Number(value) * nights);
            next.grossAmount = String(gross);
          } else if (key === "grossAmount" && value) {
            const rate = Math.round(Number(value) / nights);
            next.nightlyRate = String(rate);
          }
        }
      }
      return next;
    });
  }

  const formNights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0;

  async function handleSubmitBooking() {
    if (!form.unitId || !form.checkIn || !form.checkOut || !form.grossAmount) {
      toast.error("Please fill in unit, dates, and gross amount");
      return;
    }
    const unit = allUnits.find((u: any) => u.id === form.unitId);
    setSubmitting(true);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AIRBNB",
          unitId: form.unitId,
          date: form.checkIn,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          grossAmount: Number(form.grossAmount),
          nightlyRate: form.nightlyRate ? Number(form.nightlyRate) : undefined,
          platform: form.platform || undefined,
          agentName: form.platform === "AGENT" && form.agentName ? form.agentName : undefined,
          agentCommission: Number(form.agentCommission) || 0,
          note: form.note || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        toast.success("Booking created");
        setShowForm(false);
        setForm(EMPTY_FORM);
        fetchEntries();
        // Open guest panel for the new booking
        setSelectedEntry(created);
        setShowGuests(true);
        setEditingEntry(false);
      } else {
        const err = await res.json();
        toast.error(err?.error?.formErrors?.[0] ?? "Failed to save booking");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Booking detail edit ────────────────────────────────────────────────────

  function openDetail(entry: any) {
    setSelectedEntry(entry);
    setEditingEntry(false);
    setShowGuests(false);
    setEditForm({});
  }

  function startEdit(entry: any) {
    setEditingEntry(true);
    setEditForm({
      grossAmount: String(entry.grossAmount),
      nightlyRate: entry.nightlyRate ? String(entry.nightlyRate) : "",
      agentCommission: String(entry.agentCommission),
      platform: entry.platform ?? "AIRBNB",
      agentName: entry.agentName ?? "",
      note: entry.note ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!selectedEntry) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/income/${selectedEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AIRBNB",
          unitId: selectedEntry.unitId,
          date: format(new Date(selectedEntry.date), "yyyy-MM-dd"),
          checkIn: selectedEntry.checkIn ? format(new Date(selectedEntry.checkIn), "yyyy-MM-dd") : undefined,
          checkOut: selectedEntry.checkOut ? format(new Date(selectedEntry.checkOut), "yyyy-MM-dd") : undefined,
          grossAmount: Number(editForm.grossAmount ?? selectedEntry.grossAmount),
          nightlyRate: editForm.nightlyRate ? Number(editForm.nightlyRate) : undefined,
          agentCommission: Number(editForm.agentCommission ?? selectedEntry.agentCommission),
          platform: (editForm.platform as any) ?? selectedEntry.platform,
          agentName: editForm.platform === "AGENT" ? editForm.agentName : undefined,
          note: editForm.note ?? selectedEntry.note,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedEntry(updated);
        setEditingEntry(false);
        fetchEntries();
        toast.success("Booking updated");
      } else {
        toast.error("Failed to update booking");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/income/${deleteId}`, { method: "DELETE" });
      setSelectedEntry(null);
      setDeleteId(null);
      fetchEntries();
      toast.success("Booking deleted");
    } finally {
      setDeleting(false);
    }
  }

  // ── Turnovers ─────────────────────────────────────────────────────────────
  const in14 = new Date(today.getTime() + 14 * 86400000);

  const upcomingTurnovers = useMemo(() =>
    allEntries
      .filter((e: any) => {
        if (!e.checkOut) return false;
        const co = startOfDay(new Date(e.checkOut));
        return co >= today && co <= in14;
      })
      .sort((a: any, b: any) => new Date(a.checkOut).getTime() - new Date(b.checkOut).getTime()),
    [allEntries],
  );

  function hasCleaningJob(entry: any): boolean {
    if (!entry.checkOut) return false;
    const coDate = format(new Date(entry.checkOut), "yyyy-MM-dd");
    return cleaningJobs.some(
      (j: any) => j.unitId === entry.unitId && j.scheduledDate && format(new Date(j.scheduledDate), "yyyy-MM-dd") === coDate,
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

  function getBookingSpan(entry: any) {
    if (!entry.checkIn || !entry.checkOut) return null;
    const ci = startOfDay(new Date(entry.checkIn));
    const co = startOfDay(new Date(entry.checkOut));
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd   = new Date(month.getFullYear(), month.getMonth(), daysInMonth);

    const spanStart = ci < monthStart ? monthStart : ci;
    const spanEnd   = co > new Date(monthEnd.getTime() + 86400000) ? new Date(monthEnd.getTime() + 86400000) : co;
    if (spanStart >= spanEnd) return null;

    const startDay  = spanStart.getDate();
    const endDay    = spanEnd.getDate();
    const nights    = nightsBetween(spanStart, spanEnd);
    return { startDay, endDay, nights };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-cream">
      <Header title="Airbnb" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm w-fit">
          {([
            { key: "calendar",  label: "Calendar",  icon: CalendarDays },
            { key: "dashboard", label: "Dashboard", icon: BarChart2 },
            { key: "turnovers", label: "Turnovers", icon: Wrench },
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

        {airbnbProperties.length === 0 ? (
          <EmptyState title="No Airbnb properties" description="Switch to an Airbnb property to view this page" icon={<CalendarDays size={40} />} />
        ) : (
          <>
            {/* ════════════ CALENDAR TAB ════════════════════════════════════ */}
            {tab === "calendar" && (
              <div className="space-y-4">

                {/* Month nav + add booking */}
                <div className="flex items-center justify-between">
                  <MonthPicker value={month} onChange={setMonth} />
                  <div className="flex items-center gap-2">
                    <button onClick={fetchEntries} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-header font-sans transition-colors">
                      <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, unitId: allUnits[0]?.id ?? "" }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-white text-xs font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors"
                    >
                      <Plus size={13} /> New Booking
                    </button>
                  </div>
                </div>

                {/* Today's status bar */}
                {todayStatus.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {todayStatus.map(({ unit, booking }) => {
                      const primaryGuest = (booking?.bookingGuests ?? []).find((g: any) => g.isPrimary)?.guest ?? (booking?.bookingGuests ?? [])[0]?.guest;
                      return (
                        <div
                          key={unit.id}
                          onClick={() => booking && openDetail(booking)}
                          className={clsx(
                            "rounded-xl p-3 border transition-colors",
                            booking ? "bg-amber-50 border-gold/30 cursor-pointer hover:border-gold/60" : "bg-white border-gray-100",
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-mono font-semibold text-header">{unit.unitNumber}</span>
                            <span className={clsx(
                              "text-xs font-sans font-medium px-2 py-0.5 rounded-full",
                              booking ? "bg-gold/10 text-gold-dark" : "bg-green-50 text-income",
                            )}>
                              {booking ? "Booked" : "Available"}
                            </span>
                          </div>
                          {booking ? (
                            <div className="text-xs text-gray-500 font-sans">
                              <p className="font-medium text-gray-700">{primaryGuest?.name ?? "Guest"}</p>
                              <p>Checkout: {formatDate(booking.checkOut)}</p>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowForm(true); setForm({ ...EMPTY_FORM, unitId: unit.id }); }}
                              className="text-xs text-gold hover:text-gold-dark font-sans transition-colors flex items-center gap-1"
                            >
                              <Plus size={11} /> Add booking
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New Booking Form */}
                {showForm && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-base text-header">New Booking</h3>
                      <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-header transition-colors"><X size={18} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Unit */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 font-sans mb-1">Unit *</label>
                        <select
                          value={form.unitId}
                          onChange={(e) => setForm((p) => ({ ...p, unitId: e.target.value }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50"
                        >
                          <option value="">Select unit…</option>
                          {allUnits.map((u: any) => (
                            <option key={u.id} value={u.id}>{u.unitNumber} ({u.propertyName})</option>
                          ))}
                        </select>
                      </div>
                      {/* Check-in / Check-out */}
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Check-in *</label>
                        <input type="date" value={form.checkIn} onChange={(e) => setFormField("checkIn", e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Check-out *</label>
                        <input type="date" value={form.checkOut} onChange={(e) => setFormField("checkOut", e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                      {/* Nights (computed) */}
                      {formNights > 0 && (
                        <div className="col-span-2">
                          <p className="text-xs text-gold font-sans font-medium">{formNights} night{formNights !== 1 ? "s" : ""}</p>
                        </div>
                      )}
                      {/* Nightly rate */}
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Nightly Rate</label>
                        <input type="number" step="1" value={form.nightlyRate} onChange={(e) => setFormField("nightlyRate", e.target.value)} placeholder="Auto-computed" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                      {/* Gross amount */}
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Gross Amount *</label>
                        <input type="number" step="0.01" value={form.grossAmount} onChange={(e) => setFormField("grossAmount", e.target.value)} placeholder="Total received" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                      {/* Platform */}
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Platform</label>
                        <select value={form.platform} onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50">
                          <option value="AIRBNB">Airbnb</option>
                          <option value="BOOKING_COM">Booking.com</option>
                          <option value="DIRECT">Direct</option>
                          <option value="AGENT">Agent</option>
                        </select>
                      </div>
                      {/* Agent */}
                      {form.platform === "AGENT" && (
                        <div>
                          <label className="block text-xs text-gray-500 font-sans mb-1">Agent</label>
                          <select value={form.agentName} onChange={(e) => setForm((p) => ({ ...p, agentName: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50">
                            <option value="">Select…</option>
                            {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Commission */}
                      <div>
                        <label className="block text-xs text-gray-500 font-sans mb-1">Commission</label>
                        <input type="number" step="0.01" value={form.agentCommission} onChange={(e) => setForm((p) => ({ ...p, agentCommission: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                      {/* Note */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 font-sans mb-1">Note</label>
                        <input type="text" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Optional note…" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={handleSubmitBooking}
                        disabled={submitting}
                        className="flex items-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Save Booking
                      </button>
                      <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-sm font-sans text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    </div>
                  </Card>
                )}

                {/* Calendar grid */}
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : (
                  <Card padding="none">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-display text-header">{format(month, "MMMM yyyy")} — Occupancy</p>
                      <div className="flex items-center gap-4">
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
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                            const isToday = new Date(month.getFullYear(), month.getMonth(), d).toDateString() === today.toDateString();
                            return (
                              <div key={d} className={clsx("text-center text-xs font-sans font-medium py-1", isToday ? "text-gold bg-amber-50 rounded" : "text-gray-400")}>{d}</div>
                            );
                          })}
                        </div>
                        {/* Unit rows */}
                        {allUnits.map((unit: any) => {
                          const unitEntries = entries.filter((e: any) => e.unitId === unit.id && e.checkIn && e.checkOut);
                          return (
                            <div key={unit.id} className="grid items-center mb-1.5 relative" style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, 1fr)`, minHeight: "36px" }}>
                              <div className="text-xs font-mono font-medium text-gray-600 pr-2 truncate">{unit.unitNumber}</div>
                              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                                const isToday = new Date(month.getFullYear(), month.getMonth(), d).toDateString() === today.toDateString();
                                return <div key={d} className={clsx("h-8 border-l border-gray-100", isToday ? "bg-amber-50/50" : "bg-gray-50/50")} />;
                              })}
                              {unitEntries.map((entry: any) => {
                                const span = getBookingSpan(entry);
                                if (!span) return null;
                                const colour = PLATFORM_COLOURS[entry.platform ?? ""] ?? "bg-gold";
                                const left  = `calc(120px + ${span.startDay - 1} * (100% - 120px) / ${daysInMonth})`;
                                const width = `calc(${span.nights} * (100% - 120px) / ${daysInMonth})`;
                                const guests = entry.bookingGuests ?? [];
                                const primaryGuest = guests.find((g: any) => g.isPrimary)?.guest ?? guests[0]?.guest;
                                return (
                                  <div
                                    key={entry.id}
                                    title={`${primaryGuest?.name ?? "Guest"} · ${span.nights}n · ${formatCurrency(entry.grossAmount, currency)}`}
                                    onClick={() => openDetail(entry)}
                                    className={clsx(
                                      "absolute top-1 h-6 rounded-md flex items-center px-2 cursor-pointer text-white text-xs font-sans font-medium truncate shadow-sm transition-opacity hover:opacity-80",
                                      colour,
                                      selectedEntry?.id === entry.id && "ring-2 ring-white ring-offset-1",
                                    )}
                                    style={{ left, width }}
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

                {/* Booking Detail Panel */}
                {selectedEntry && (
                  <Card>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-display text-base text-header">Booking Details</h3>
                        <p className="text-xs text-gray-400 font-sans mt-0.5">
                          {selectedEntry.unit?.unitNumber} · {selectedEntry.checkIn ? formatDate(selectedEntry.checkIn) : "—"} → {selectedEntry.checkOut ? formatDate(selectedEntry.checkOut) : "—"}
                          {selectedEntry.checkIn && selectedEntry.checkOut && (
                            <span className="ml-2 text-gold font-medium">{nightsBetween(selectedEntry.checkIn, selectedEntry.checkOut)} nights</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!editingEntry && (
                          <>
                            <button onClick={() => startEdit(selectedEntry)} className="p-1.5 text-gray-400 hover:text-gold transition-colors rounded-md hover:bg-amber-50" title="Edit"><Pencil size={15} /></button>
                            <button onClick={() => setDeleteId(selectedEntry.id)} className="p-1.5 text-gray-400 hover:text-expense transition-colors rounded-md hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                          </>
                        )}
                        <button onClick={() => { setSelectedEntry(null); setEditingEntry(false); setShowGuests(false); }} className="p-1.5 text-gray-400 hover:text-header transition-colors"><X size={15} /></button>
                      </div>
                    </div>

                    {editingEntry ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 font-sans mb-1">Gross Amount</label>
                          <input type="number" step="0.01" value={editForm.grossAmount ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, grossAmount: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 font-sans mb-1">Nightly Rate</label>
                          <input type="number" step="1" value={editForm.nightlyRate ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, nightlyRate: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 font-sans mb-1">Platform</label>
                          <select value={editForm.platform ?? "AIRBNB"} onChange={(e) => setEditForm((p) => ({ ...p, platform: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50">
                            <option value="AIRBNB">Airbnb</option>
                            <option value="BOOKING_COM">Booking.com</option>
                            <option value="DIRECT">Direct</option>
                            <option value="AGENT">Agent</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 font-sans mb-1">Commission</label>
                          <input type="number" step="0.01" value={editForm.agentCommission ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, agentCommission: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 font-sans mb-1">Note</label>
                          <input type="text" value={editForm.note ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-1 focus:ring-gold/50" />
                        </div>
                        <div className="col-span-2 flex gap-3">
                          <button onClick={handleSaveEdit} disabled={savingEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-white text-xs font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50">
                            {savingEdit ? <Loader2 size={12} className="animate-spin" /> : null} Save
                          </button>
                          <button onClick={() => setEditingEntry(false)} className="px-3 py-1.5 border border-gray-200 text-xs font-sans text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 text-sm font-sans">
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Gross</p>
                          <CurrencyDisplay amount={selectedEntry.grossAmount} size="md" className="text-income" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Nightly Rate</p>
                          {selectedEntry.nightlyRate
                            ? <CurrencyDisplay amount={selectedEntry.nightlyRate} size="md" className="text-header" />
                            : <span className="text-gray-400 text-xs">—</span>}
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Commission</p>
                          <CurrencyDisplay amount={selectedEntry.agentCommission} size="md" className={selectedEntry.agentCommission > 0 ? "text-expense" : "text-gray-400"} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Platform</p>
                          <p className="text-header">{PLATFORM_LABELS[selectedEntry.platform ?? ""] ?? selectedEntry.platform ?? "—"}</p>
                        </div>
                        {selectedEntry.agentName && (
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Agent</p>
                            <p className="text-header">{selectedEntry.agentName}</p>
                          </div>
                        )}
                        {selectedEntry.note && (
                          <div className="col-span-3">
                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Note</p>
                            <p className="text-gray-600 italic">{selectedEntry.note}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Guests section */}
                    {!editingEntry && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => setShowGuests((v) => !v)}
                          className="flex items-center gap-2 text-sm font-sans font-medium text-gray-500 hover:text-header transition-colors"
                        >
                          <Users size={14} className="text-gold" />
                          Guests
                          {showGuests ? " (hide)" : " (show)"}
                        </button>
                        {showGuests && (
                          <div className="mt-3">
                            <GuestPanel incomeEntryId={selectedEntry.id} />
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* ════════════ DASHBOARD TAB ══════════════════════════════════ */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <MonthPicker value={month} onChange={setMonth} />
                  <button onClick={fetchEntries} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-header font-sans transition-colors">
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                  </button>
                </div>
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-3">
                      <Card padding="sm">
                        <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Occupancy</p>
                        <p className={`text-2xl font-display mt-1 ${kpi.avgOcc >= 0.8 ? "text-income" : kpi.avgOcc >= 0.5 ? "text-amber-600" : "text-expense"}`}>{Math.round(kpi.avgOcc * 100)}%</p>
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
                        <p className="text-xs text-gray-400 font-sans mt-0.5">rev / avail room / night</p>
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
                  </>
                )}
              </div>
            )}

            {/* ════════════ TURNOVERS TAB ══════════════════════════════════ */}
            {tab === "turnovers" && (
              <div className="space-y-4">
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
                                  {daysUntil === 0 ? <span className="text-expense font-medium">Today</span> : daysUntil === 1 ? <span className="text-amber-600 font-medium">Tomorrow</span> : <span className="text-gray-400">In {daysUntil} days</span>}
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
                                <span className="flex items-center gap-1.5 text-xs text-income font-sans font-medium"><CheckCircle2 size={14} /> Task Created</span>
                              ) : (
                                <button disabled={isCreating} onClick={() => createTurnoverJob(entry)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-white rounded-lg font-sans font-medium hover:bg-gold-dark transition-colors disabled:opacity-50">
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
                            .sort((a, b) => (a.scheduledDate && b.scheduledDate) ? new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime() : 0)
                            .map((job: any) => (
                              <tr key={job.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{job.unit?.unitNumber ?? "—"}</td>
                                <td className="px-4 py-3 text-sm font-sans text-header">{job.title}</td>
                                <td className="px-4 py-3 text-sm font-sans text-gray-500">{job.scheduledDate ? formatDate(job.scheduledDate) : "—"}</td>
                                <td className="px-4 py-3 text-sm font-sans text-gray-500">{job.assignedTo ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={job.status === "DONE" ? "green" : job.status === "IN_PROGRESS" ? "blue" : job.status === "OPEN" ? "amber" : "gray"}>
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

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete booking?"
        message="This booking record will be permanently deleted from the income ledger."
        loading={deleting}
      />
    </div>
  );
}
