import Link from "next/link";
import { Receipt, Sparkles, ShieldQuestion } from "lucide-react";
import { clsx } from "clsx";
import { formatCurrency } from "@/lib/currency";

type Severity = "URGENT" | "WARNING" | "INFO";

interface Row {
  severity: Severity;
  icon: React.ReactNode;
  title: string;
  amountLabel?: string;
  propertyChip: string;
  triggeredBy: string;
  systemDid: string;
  actionLabel: string;
}

const SEVERITY: Record<Severity, { dot: string; bg: string; iconBg: string; pill: string }> = {
  URGENT:  { dot: "bg-red-500",   bg: "border-red-200",   iconBg: "bg-red-100 text-red-600",       pill: "bg-red-50 text-red-700"     },
  WARNING: { dot: "bg-amber-500", bg: "border-amber-200", iconBg: "bg-amber-100 text-amber-700",   pill: "bg-amber-50 text-amber-700" },
  INFO:    { dot: "bg-blue-500",  bg: "border-blue-200",  iconBg: "bg-blue-100 text-blue-700",     pill: "bg-blue-50 text-blue-700"   },
};

const ROWS: Row[] = [
  {
    severity: "URGENT",
    icon: <Receipt size={16} />,
    title: "Rent overdue · Unit 4B · Sarah Chen",
    amountLabel: `${formatCurrency(2400, "GBP")} · 9 days past due`,
    propertyChip: "Belsize Court · London",
    triggeredBy: "Invoice for March is 9 days past due",
    systemDid:
      "Logged the overdue status on day 1. Sent a reminder email at 07:00 UTC yesterday. Surfaced this in your inbox at URGENT severity because dunning crossed the 7-day threshold.",
    actionLabel: "Send formal notice",
  },
  {
    severity: "WARNING",
    icon: <ShieldQuestion size={16} />,
    title: `Approval waiting on owner · Water heater repair · ${formatCurrency(1200, "USD")}`,
    propertyChip: "Mayfair Suites · Nairobi",
    triggeredBy: "Magic-link sent 3 days ago, owner has not responded",
    systemDid:
      "Set the case to \"waiting on owner\" — the SLA clock is paused so this isn't counted against your response time. Logged the email in the case timeline.",
    actionLabel: "Resend approval link",
  },
  {
    severity: "INFO",
    icon: <Sparkles size={16} />,
    title: "Unit 2A vacant for 32 days",
    propertyChip: "Al Seef Residences · Manama",
    triggeredBy: "Daily check spotted a unit vacant > 30 days",
    systemDid:
      "Pre-filled the action: change unit status to \"Listed\" with one click. No data entry needed.",
    actionLabel: "Mark as listed",
  },
];

export function InboxMock() {
  return (
    <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white mb-4 leading-snug">
            A day in your inbox.
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400 font-sans">
            Everything the system did overnight, ranked by what needs you.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#162032] shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-cream dark:bg-[#0C1B2E]">
            <h3 className="font-display text-base text-header dark:text-white">Today: 3 things need you.</h3>
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 dark:text-gray-500">Inbox</span>
          </div>

          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {ROWS.map((row, idx) => {
              const s = SEVERITY[row.severity];
              return (
                <li key={idx} className={clsx("px-5 py-4 flex items-start gap-3 border-l-4", s.bg)}>
                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${s.dot}`} />
                  <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", s.iconBg)}>
                    {row.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-semibold text-sm text-header dark:text-white leading-snug">
                      {row.title}
                    </p>
                    {row.amountLabel && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-0.5">{row.amountLabel}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="inline-flex items-center text-[10px] font-medium font-sans px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300">
                        {row.propertyChip}
                      </span>
                      <span className={clsx("inline-flex items-center text-[10px] font-medium font-sans px-2 py-0.5 rounded-full", s.pill)}>
                        Triggered by: {row.triggeredBy}
                      </span>
                    </div>
                    <p className="text-xs font-sans italic text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                      <span className="not-italic font-medium text-gray-600 dark:text-gray-300">System already did:</span>{" "}
                      {row.systemDid}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="hidden sm:inline-flex items-center px-3 py-2 rounded-lg bg-header text-white text-xs font-sans font-semibold hover:bg-header/90 transition-colors shrink-0"
                  >
                    {row.actionLabel}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="px-5 py-3 bg-cream dark:bg-[#0C1B2E] border-t border-gray-100 dark:border-white/10">
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans">
              + 11 other items handled automatically yesterday. (Rent reminders sent, owner statements refreshed, case stages advanced.)
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/signup?demo=al-seef" className="text-sm font-sans text-gold hover:text-gold-dark transition-colors">
            Open the live demo inbox →
          </Link>
        </div>
      </div>
    </section>
  );
}
