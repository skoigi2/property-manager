import Link from "next/link";

function DashboardMockup() {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(26,26,46,0.14)] border border-gray-200/50 dark:border-white/10 pointer-events-none select-none"
      aria-hidden="true"
    >
      {/* Browser chrome */}
      <div className="bg-header px-4 py-3 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15 inline-block" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/25 inline-block" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/35 inline-block" />
        <div className="flex-1 mx-4">
          <div className="bg-header/60 rounded-md py-1 px-3 text-center max-w-xs mx-auto">
            <span className="text-white/40 text-xs font-mono">groundworkpm.com</span>
          </div>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="bg-cream dark:bg-[#091525] p-5">
        <div className="flex justify-between items-center mb-5">
          <span className="font-display text-sm text-header dark:text-white">Al Seef Residences · Manama</span>
          <span className="text-xs font-sans text-gray-400 bg-white dark:bg-[#162032] px-3 py-1.5 rounded-lg border border-gray-100 dark:border-white/10">
            April 2026
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Monthly Income</p>
            <p className="text-xl font-display text-header dark:text-white">BD 24,750</p>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-income bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-income inline-block" />
              +8% vs last month
            </span>
          </div>

          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Occupancy Rate</p>
            <p className="text-xl font-display text-header dark:text-white">92%</p>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: "92%" }} />
            </div>
          </div>

          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Pending Maintenance</p>
            <p className="text-xl font-display text-gold-dark">3</p>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full font-sans">
              2 overdue
            </span>
          </div>

          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Owner Reports</p>
            <p className="text-xl font-display text-header dark:text-white">12</p>
            <p className="text-[10px] text-gray-400 font-sans mt-2">Sent this month</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-header dark:text-white">Recent Income</span>
              <span className="text-[10px] text-gold font-sans">View all →</span>
            </div>
            {[
              { unit: "Unit 4A — Rent", amount: "BD 1,150" },
              { unit: "Unit 2B — Rent", amount: "BD 980"   },
              { unit: "Unit 7C — Rent", amount: "BD 1,320" },
            ].map((row) => (
              <div key={row.unit} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-white/5 last:border-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-sans">{row.unit}</span>
                <span className="text-xs font-semibold text-income font-sans">{row.amount}</span>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10">
            <p className="text-xs font-semibold text-header dark:text-white mb-3">Rent Collection</p>
            <div className="w-full h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-income/70" style={{ flex: 8 }} />
              <div className="h-full bg-gold/60" style={{ flex: 1 }} />
              <div className="h-full bg-expense/60" style={{ flex: 1 }} />
            </div>
            <div className="flex gap-3 mt-2.5 flex-wrap">
              {[
                { color: "bg-income/70",  label: "8 paid"    },
                { color: "bg-gold/60",    label: "1 pending" },
                { color: "bg-expense/60", label: "1 overdue" },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 font-sans">
                  <span className={`w-2 h-2 rounded-full ${item.color} inline-block`} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-3xl mx-auto">
        <p className="text-center text-[10px] font-mono uppercase tracking-widest text-gold-dark dark:text-gold/80 mb-2">
          Sample property — Al Seef Residences (20 units, Bahrain)
        </p>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 font-sans mb-10 max-w-xl mx-auto">
          A real demo seed. Open it and click around. Every cron job, every case timeline, every owner statement is wired up.
        </p>

        <DashboardMockup />

        <div className="text-center mt-8">
          <Link href="/signup?demo=al-seef" className="text-sm font-sans text-gold hover:text-gold-dark transition-colors">
            Open the demo dashboard →
          </Link>
        </div>
      </div>
    </section>
  );
}
