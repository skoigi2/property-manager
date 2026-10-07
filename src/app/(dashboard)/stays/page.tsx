"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProperty } from "@/lib/property-context";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { TutorialVideo } from "@/components/ui/TutorialVideo";
import { STAY_STAGE_LABEL, dayOf, type StayStage } from "@/lib/stay-rules";
import { BedDouble, ChevronLeft, ChevronRight, IdCard, KeyRound, Sparkles, ClipboardCheck, Users } from "lucide-react";
import { addDays, dayLabel, localDay, stageOf, PLATFORM_LABEL, type StaySummaryDto } from "@/components/stays/types";

// Short-stay guests for on-site staff: who arrives, who is in, who leaves,
// which units need turning over — and a calendar. Never rates or totals.

type View = "today" | "upcoming" | "calendar";
const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "calendar", label: "Calendar" },
];

const STAGE_BADGE: Record<StayStage, "gray" | "blue" | "amber" | "green" | "gold"> = {
  upcoming: "gray", arriving: "gold", in_house: "blue", turnover: "amber", done: "green",
};

interface PropertyOption { id: string; name: string; type?: string; units?: { id: string; unitNumber: string }[] }

export default function StaysPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <StaysInner />
    </Suspense>
  );
}

function StaysInner() {
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const { selectedId } = useProperty();
  const search = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const v = search.get("view");
    return v === "upcoming" || v === "calendar" ? v : "today";
  });
  const today = localDay();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [rows, setRows] = useState<StaySummaryDto[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (view === "today") return { from: addDays(today, -7), to: addDays(today, 1) };
    if (view === "upcoming") return { from: addDays(today, 1), to: addDays(today, 30) };
    const first = `${month}-01`;
    const last = localDay(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
    return { from: first, to: last };
  }, [view, today, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(range);
      if (selectedId) qs.set("propertyId", selectedId);
      if (view === "today") qs.set("open", "1");
      const res = await fetch(`/api/stays?${qs}`);
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      toast.error("Couldn't load stays");
    } finally {
      setLoading(false);
    }
  }, [range, selectedId, view]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header title="Guest stays" userName={session?.user?.name ?? session?.user?.email} role={orgRole} />
      <div className="page-container space-y-4 pb-24 lg:pb-8">
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => setView(v.key)}
                  className={clsx("px-3 py-1.5 text-caption font-medium transition-colors", view === v.key ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  {v.label}
                </button>
              ))}
            </div>
            <TutorialVideo tutorialKey="guest-stays" variant="link" />
            {view === "calendar" && (
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
                <span className="text-body font-medium text-header min-w-32 text-center">
                  {new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </span>
                <button type="button" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
              </div>
            )}
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : view === "today" ? (
          <TodayView rows={rows} today={today} />
        ) : view === "upcoming" ? (
          rows.length === 0
            ? <EmptyState icon={<BedDouble size={40} />} title="No arrivals in the next 30 days" description="Bookings the manager adds on the Airbnb page appear here." />
            : <div className="space-y-2">{rows.filter((r) => dayOf(r.checkIn) > today).map((r) => <StayCard key={r.id} s={r} today={today} />)}</div>
        ) : (
          <CalendarView rows={rows} month={month} today={today} propertyId={selectedId} />
        )}
      </div>
    </div>
  );
}

function shiftMonth(m: string, n: number): string {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TodayView({ rows, today }: { rows: StaySummaryDto[]; today: string }) {
  const groups = useMemo(() => {
    const arriving: StaySummaryDto[] = [], departing: StaySummaryDto[] = [], overdue: StaySummaryDto[] = [], inHouse: StaySummaryDto[] = [], turnover: StaySummaryDto[] = [];
    for (const r of rows) {
      const stage = stageOf(r, today);
      if (stage === "arriving") arriving.push(r);
      else if (stage === "in_house") {
        const out = dayOf(r.checkOut);
        (out < today ? overdue : out === today ? departing : inHouse).push(r);
      }
      // A past stay nobody recorded anything on (e.g. booked before stays were
      // tracked) drops out a day after check-out instead of lingering here.
      else if (stage === "turnover" && (r.stay.keysReturnedAt || r.stay.cleanerKeysOutAt || r.inspection || dayOf(r.checkOut) >= addDays(today, -1))) turnover.push(r);
    }
    turnover.sort((a, b) => a.checkOut.localeCompare(b.checkOut));
    overdue.sort((a, b) => a.checkOut.localeCompare(b.checkOut));
    return [
      { key: "overdue", title: "Keys not back", hint: "The guest has checked out but the keys aren't recorded as returned.", rows: overdue },
      { key: "arriving", title: "Arriving", hint: "Upload the main guest's ID, then hand over the keys.", rows: arriving },
      { key: "departing", title: "Leaving today", hint: "Collect the keys.", rows: departing },
      { key: "turnover", title: "Turnover", hint: "Post-stay check, then keys to the cleaner and back.", rows: turnover },
      { key: "in_house", title: "In house", hint: null, rows: inHouse },
    ].filter((g) => g.rows.length > 0);
  }, [rows, today]);

  if (groups.length === 0) {
    return <EmptyState icon={<BedDouble size={40} />} title="Nothing on today" description="No arrivals, departures or turnovers. Upcoming stays are on the next tab." />;
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <div>
            <h2 className="text-h3 text-header">{g.title} <span className="text-gray-400 tabular-nums">· {g.rows.length}</span></h2>
            {g.hint && <p className="text-caption text-gray-500">{g.hint}</p>}
          </div>
          {g.rows.map((r) => <StayCard key={r.id} s={r} today={today} />)}
        </section>
      ))}
    </div>
  );
}

function StayCard({ s, today }: { s: StaySummaryDto; today: string }) {
  const stage = stageOf(s, today);
  const st = s.stay;
  const leavingToday = stage === "in_house" && dayOf(s.checkOut) === today;
  const keysOverdue = stage === "in_house" && dayOf(s.checkOut) < today;
  return (
    <Link href={`/stays/${s.id}`} className="block">
      <Card padding="sm" className="hover:border-gold/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-body font-medium text-header truncate">
              Unit {s.unit.unitNumber}{s.mainGuestName ? ` · ${s.mainGuestName}` : ""}
            </p>
            <p className="text-caption text-gray-400 mt-0.5 truncate">
              {s.property.name} · {dayLabel(s.checkIn)} – {dayLabel(s.checkOut)} · {s.nights} night{s.nights === 1 ? "" : "s"}
              {s.platform ? ` · ${PLATFORM_LABEL[s.platform] ?? s.platform}` : ""}
            </p>
          </div>
          <Badge className="whitespace-nowrap shrink-0" variant={keysOverdue ? "red" : leavingToday ? "amber" : STAGE_BADGE[stage]}>{keysOverdue ? "Keys not back" : leavingToday ? "Leaving today" : STAY_STAGE_LABEL[stage]}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-caption">
          <span className="flex items-center gap-1 text-gray-500"><Users size={12} /> {s.guestCount || "No"} guest{s.guestCount === 1 ? "" : "s"}</span>
          <span className={clsx("flex items-center gap-1", s.idState === "missing" ? "text-amber-700" : "text-green-700")}>
            <IdCard size={12} /> {s.idState === "ok" ? "ID on file" : s.idState === "overridden" ? "ID waived by manager" : "ID missing"}
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <KeyRound size={12} /> {st.keysReturnedAt ? "Keys back" : st.keysHandedAt ? "Guest has keys" : "Keys not handed over"}
          </span>
          {(stage === "turnover" || stage === "done") && (
            <>
              <span className={clsx("flex items-center gap-1", s.inspection?.damaged ? "text-expense font-medium" : "text-gray-500")}>
                <ClipboardCheck size={12} />
                {!s.inspection ? "No post-stay check" : s.inspection.status === "SCHEDULED" || s.inspection.status === "IN_PROGRESS" ? "Check in progress" : s.inspection.damaged ? `${s.inspection.damaged} damaged` : "Checked — fine"}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <Sparkles size={12} /> {st.cleanerKeysBackAt ? "Cleaner done" : st.cleanerKeysOutAt ? `With ${st.cleanerName ?? "the cleaner"}` : "Cleaner not started"}
              </span>
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}

function CalendarView({ rows, month, today, propertyId }: { rows: StaySummaryDto[]; month: string; today: string; propertyId: string | null }) {
  const { data: properties } = useCachedFetch<PropertyOption[]>("properties:full", "/api/properties");
  const days = useMemo(() => {
    const n = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  }, [month]);
  // Short-stay units (AIRBNB properties), plus any unit that has a booking this month.
  const units = useMemo(() => {
    const out = new Map<string, { id: string; label: string }>();
    for (const p of properties ?? []) {
      if (p.type !== "AIRBNB" || (propertyId && p.id !== propertyId)) continue;
      for (const u of p.units ?? []) out.set(u.id, { id: u.id, label: `${u.unitNumber}` });
    }
    for (const r of rows) if (!out.has(r.unit.id)) out.set(r.unit.id, { id: r.unit.id, label: r.unit.unitNumber });
    return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [properties, rows, propertyId]);

  if (units.length === 0) {
    return <EmptyState icon={<BedDouble size={40} />} title="No short-stay units" description="Short-stay bookings appear here once the manager adds them on the Airbnb page." />;
  }
  return (
    <Card padding="sm" className="overflow-x-auto">
      <div className="grid gap-y-1 min-w-[720px]" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(20px, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className={clsx("text-label text-center py-1", d === today ? "text-gold-dark font-semibold" : "text-gray-400")}>{Number(d.slice(8))}</div>
        ))}
        {units.map((u) => {
          const unitRows = rows.filter((r) => r.unit.id === u.id);
          return (
            <UnitRow key={u.id} label={u.label} days={days} stays={unitRows} today={today} />
          );
        })}
      </div>
      <p className="text-caption text-gray-400 mt-2">Tap a booking to open the stay. Each bar runs from check-in to the night before check-out.</p>
    </Card>
  );
}

function UnitRow({ label, days, stays, today }: { label: string; days: string[]; stays: StaySummaryDto[]; today: string }) {
  return (
    <>
      <div className="text-caption font-medium text-header tabular-nums truncate pr-1 py-1.5">{label}</div>
      {days.map((d) => {
        const s = stays.find((r) => dayOf(r.checkIn) <= d && d < dayOf(r.checkOut));
        if (!s) return <div key={d} className={clsx("h-7 border-r border-white", d === today ? "bg-gold/10" : "bg-gray-50")} />;
        const start = dayOf(s.checkIn) === d || d === days[0];
        return (
          <Link key={d} href={`/stays/${s.id}`} title={`${s.mainGuestName ?? "Guest"} · ${dayLabel(s.checkIn)} – ${dayLabel(s.checkOut)}`}
            className={clsx("h-7 bg-blue-400 hover:bg-blue-500 text-white text-label overflow-hidden whitespace-nowrap flex items-center", start ? "rounded-l-md pl-1" : "")}>
            {start ? (s.mainGuestName?.split(" ")[0] ?? "") : ""}
          </Link>
        );
      })}
    </>
  );
}
