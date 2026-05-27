import { ArrowRight, ArrowDown, MessageCircle, FileSpreadsheet, StickyNote, Mail } from "lucide-react";

function ShiftVisual() {
  return (
    <div className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-6 md:gap-4">
      {/* Left pane — messy cluster */}
      <div className="relative h-56 md:h-72 rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#162032] overflow-hidden">
        <span className="absolute top-4 left-4 text-[10px] uppercase tracking-widest font-mono text-gray-400 dark:text-gray-500">Before</span>

        {/* WhatsApp bubble */}
        <div className="absolute top-12 left-6 max-w-[180px] bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/40 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm rotate-[-3deg]">
          <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-300 font-sans mb-0.5">
            <MessageCircle size={10} /> WhatsApp · Mr. Patel
          </div>
          <p className="text-xs font-sans text-gray-700 dark:text-gray-200">Any update on the kitchen drain?</p>
        </div>

        {/* Excel cell */}
        <div className="absolute top-20 right-4 rotate-[5deg] bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800/60 rounded px-2 py-1 shadow-sm">
          <div className="text-[9px] font-mono text-green-800 dark:text-green-300">B12: =SUM(B2:B11)</div>
        </div>

        {/* Sticky note */}
        <div className="absolute bottom-8 left-12 rotate-[-6deg] bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-200 dark:border-yellow-800/60 px-3 py-2 shadow-md w-32">
          <div className="flex items-center gap-1 text-[9px] text-yellow-800 dark:text-yellow-300 font-sans mb-0.5">
            <StickyNote size={10} /> Note to self
          </div>
          <p className="text-[10px] font-sans text-yellow-900 dark:text-yellow-200 leading-tight">Send Belsize Q1 report Friday</p>
        </div>

        {/* Email avatar */}
        <div className="absolute bottom-4 right-6 rotate-[3deg] bg-white dark:bg-[#0C1B2E] border border-gray-200 dark:border-white/15 rounded-lg px-2.5 py-1.5 shadow-md flex items-center gap-1.5">
          <Mail size={11} className="text-blue-600" />
          <span className="text-[10px] font-sans text-gray-600 dark:text-gray-300">3 new emails</span>
        </div>

        {/* Spreadsheet icon top-right */}
        <div className="absolute top-4 right-4 rotate-[8deg]">
          <FileSpreadsheet size={20} className="text-green-600/60" />
        </div>
      </div>

      {/* Arrow */}
      <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
        <ArrowRight size={28} className="hidden md:block" />
        <ArrowDown size={28} className="md:hidden" />
        <span className="text-[10px] font-mono uppercase tracking-widest mt-1 text-center max-w-[8rem]">Same data.<br />One surface.</span>
      </div>

      {/* Right pane — clean inbox */}
      <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#162032] overflow-hidden shadow-card">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest font-mono text-gray-400 dark:text-gray-500">After</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-sans">Inbox · 3 today</span>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-white/5">
          {[
            { dot: "bg-red-500",   label: "Rent overdue — Belsize Court Unit 4B" },
            { dot: "bg-amber-500", label: "Approval pending — Mayfair Suites · 3 days" },
            { dot: "bg-blue-500",  label: "Unit 2A vacant — 32 days · Al Seef Residences" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
              <span className="text-xs font-sans text-gray-700 dark:text-gray-200 truncate">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShiftSection() {
  return (
    <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white mb-5 leading-snug">
            Stop coordinating across WhatsApp, email, and three spreadsheets.
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
            Every agency starts this way. By the fifth property it stops working. Rent goes uncollected for a week before anyone notices. Owners chase you for statements you already sent. A repair quote sits in your phone for ten days because nobody pinged you again.
          </p>
          <p className="text-base font-sans text-header dark:text-white mt-5">
            One inbox. One timeline per issue. The reminders chase themselves.
          </p>
        </div>

        <ShiftVisual />
      </div>
    </section>
  );
}
