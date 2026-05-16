const DAYS = [
  {
    label: "Monday",
    heading: "A short list, not a deluge.",
    body:
      "The cron ran at 07:00 and filed everything into your inbox by severity. Last week's loose ends carry over with their stage SLAs visibly counting down. You handle three things before your first coffee.",
  },
  {
    label: "Tuesday – Thursday",
    heading: "Cases move themselves.",
    body:
      "Most of the work is conversations with tenants and vendors. The system handles the bookkeeping: vendor invoice attached → expense entry pre-filled; approval granted → case advances; status flipped to Completed → owner statement reflects the cost.",
  },
  {
    label: "Friday",
    heading: "Statements are sent, not drafted.",
    body:
      "There is no copy-paste step. Open the property report (PDF), check it looks right, forward it. The bank reconciliation step you used to do? It happened in the same transaction as the invoice flip.",
  },
];

export function WeeklyRhythm() {
  return (
    <section className="py-24 px-6 bg-white dark:bg-[#0C1B2E] border-y border-gray-100 dark:border-white/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white mb-4 leading-snug">
            How it works in your week.
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
            Not three onboarding steps. The shape of an operating week with the platform running.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {DAYS.map((d) => (
            <div
              key={d.label}
              className="bg-cream-dark dark:bg-[#162032] rounded-2xl p-7 border border-gray-100 dark:border-white/10"
            >
              <p className="text-[10px] font-mono uppercase tracking-widest text-gold-dark dark:text-gold/80 mb-4">
                {d.label}
              </p>
              <h3 className="font-display text-lg md:text-xl text-header dark:text-white mb-3 leading-snug">
                {d.heading}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
