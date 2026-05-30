import Link from "next/link";

export function HomeFinalCTA() {
  return (
    <section className="py-28 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="font-display text-3xl md:text-5xl text-header dark:text-white mb-6 leading-tight">
          Stop chasing information.
        </h2>
        <p className="text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed max-w-lg mx-auto mb-10">
          Bring rent, maintenance, approvals, renewals and reporting into one system built for property management teams.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-header text-white px-10 py-4 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
          >
            Start free trial →
          </Link>
          <Link
            href="/contact"
            className="text-gray-500 dark:text-gray-300 hover:text-header dark:hover:text-white px-8 py-4 rounded-xl font-medium text-base transition-colors border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/25"
          >
            Book a 15-minute demo
          </Link>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-6 italic">
          Everything your team needs to stay on top of property operations — without the spreadsheets and guesswork.
        </p>
      </div>
    </section>
  );
}
