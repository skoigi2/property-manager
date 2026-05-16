import Link from "next/link";
import { Check } from "lucide-react";

const ROWS: { task: string; spreadsheet: string; groundwork: string }[] = [
  {
    task: "Marking a rent payment received",
    spreadsheet: "Update spreadsheet, email owner",
    groundwork: "One click. Owner statement updates itself.",
  },
  {
    task: "Lease expiring in 30 days",
    spreadsheet: "Hope you remember",
    groundwork: "Cron emails you. Inbox surfaces it.",
  },
  {
    task: "Owner approval for a $1,200 repair",
    spreadsheet: "WhatsApp message, screenshot of quote, three back-and-forths",
    groundwork: "One magic link. Owner clicks Approve. Logged on the case.",
  },
  {
    task: "Vendor invoice for a completed job",
    spreadsheet: "Spreadsheet row, paper receipt, manual matching",
    groundwork: "Attachment on the case. Expense pre-filled.",
  },
  {
    task: "End-of-month owner statement",
    spreadsheet: "Two hours of copy-paste",
    groundwork: "Already current.",
  },
  {
    task: "Audit trail for a dispute",
    spreadsheet: "Search WhatsApp, hope screenshots saved",
    groundwork: "Per-case timeline of every email, comment, approval, status change.",
  },
];

export function SpreadsheetComparison() {
  return (
    <section className="py-24 px-6 bg-white dark:bg-[#0C1B2E] border-y border-gray-100 dark:border-white/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white mb-4 leading-snug">
            Why teams switch from spreadsheets.
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
            Six tasks. Same agency. Two timelines.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="bg-cream-dark dark:bg-[#162032] text-left">
                <th className="px-5 py-4 text-xs font-mono uppercase tracking-widest text-gray-400 dark:text-gray-500 w-1/4">Task</th>
                <th className="px-5 py-4 text-xs font-mono uppercase tracking-widest text-gray-400 dark:text-gray-500 w-2/5">Excel + WhatsApp + email</th>
                <th className="px-5 py-4 text-xs font-mono uppercase tracking-widest text-gold-dark dark:text-gold/80">Groundwork PM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5 bg-white dark:bg-[#0C1B2E]">
              {ROWS.map((row) => (
                <tr key={row.task}>
                  <td className="px-5 py-4 align-top text-header dark:text-white font-medium">{row.task}</td>
                  <td className="px-5 py-4 align-top text-gray-500 dark:text-gray-400">{row.spreadsheet}</td>
                  <td className="px-5 py-4 align-top text-header dark:text-white">
                    <span className="inline-flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-gold" />
                      <span>{row.groundwork}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked card pairs */}
        <div className="md:hidden space-y-6">
          {ROWS.map((row) => (
            <div key={row.task} className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#162032] overflow-hidden">
              <p className="px-4 py-3 font-display text-sm text-header dark:text-white border-b border-gray-100 dark:border-white/5">
                {row.task}
              </p>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-cream-dark/40 dark:bg-[#0C1B2E]">
                <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1">Excel + WhatsApp + email</p>
                <p className="text-sm font-sans text-gray-500 dark:text-gray-400">{row.spreadsheet}</p>
              </div>
              <div className="px-4 py-3 flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-gold" />
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-gold-dark dark:text-gold/80 mb-1">Groundwork PM</p>
                  <p className="text-sm font-sans text-header dark:text-white">{row.groundwork}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/signup" className="text-sm font-sans text-gold hover:text-gold-dark transition-colors">
            Start your 30-day trial →
          </Link>
        </div>
      </div>
    </section>
  );
}
