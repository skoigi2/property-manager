"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, startOfDay, format,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CaseRow, CaseCard } from "./shared";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dueDate(c: CaseRow): Date | null {
  return c.slaDueAt ? new Date(c.slaDueAt) : null;
}

export function CaseCalendarView({ rows }: { rows: CaseRow[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const today = startOfDay(new Date());

  const scheduled = useMemo(() => rows.filter((c) => c.slaDueAt), [rows]);
  const unscheduled = useMemo(() => rows.filter((c) => !c.slaDueAt), [rows]);

  // Bucket scheduled cases by yyyy-MM-dd
  const byDay = useMemo(() => {
    const map = new Map<string, CaseRow[]>();
    for (const c of scheduled) {
      const d = dueDate(c)!;
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [scheduled]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  // Mobile agenda: scheduled cases sorted by due date ascending
  const agenda = useMemo(() => {
    return [...scheduled].sort((a, b) => dueDate(a)!.getTime() - dueDate(b)!.getTime());
  }, [scheduled]);

  return (
    <div className="space-y-6">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-gray-900">{format(month, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth((m) => subMonths(m, 1))} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setMonth(startOfMonth(new Date()))} className="px-3 h-8 rounded-lg border border-gray-200 text-xs font-sans hover:bg-gray-50">
            Today
          </button>
          <button onClick={() => setMonth((m) => addMonths(m, 1))} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Desktop month grid */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 font-sans">
          {DAY_LABELS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayCases = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            return (
              <div key={key} className={`min-h-[6.5rem] border-b border-r border-gray-100 p-1.5 ${inMonth ? "bg-white" : "bg-gray-50/50"}`}>
                <div className={`text-[11px] font-mono mb-1 ${isToday ? "text-gold font-bold" : inMonth ? "text-gray-500" : "text-gray-300"}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayCases.slice(0, 3).map((c) => {
                    const overdue = startOfDay(dueDate(c)!) < today;
                    return (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        title={c.title}
                        className={`block text-[11px] font-sans px-1.5 py-1 rounded truncate ${overdue ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gold/10 text-gold-dark hover:bg-gold/20"}`}
                      >
                        {c.title}
                      </Link>
                    );
                  })}
                  {dayCases.length > 3 && (
                    <span className="block text-[10px] text-gray-400 font-sans px-1.5">+{dayCases.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <div className="md:hidden space-y-2">
        {agenda.length === 0 ? (
          <p className="text-sm text-gray-400 font-sans text-center py-6">No cases with an SLA deadline.</p>
        ) : (
          agenda.map((c) => {
            const overdue = startOfDay(dueDate(c)!) < today;
            return (
              <div key={c.id}>
                <p className={`text-xs font-sans mb-1 ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {format(dueDate(c)!, "EEE, d MMM")}{overdue ? " · overdue" : ""}
                </p>
                <CaseCard c={c} />
              </div>
            );
          })
        )}
      </div>

      {/* Unscheduled / no SLA */}
      {unscheduled.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 font-sans mb-2">
            No SLA deadline ({unscheduled.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {unscheduled.map((c) => <CaseCard key={c.id} c={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}
