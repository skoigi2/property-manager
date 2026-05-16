import Link from "next/link";

export function FinalCTA() {
  return (
    <section className="py-28 px-6 bg-cream-dark dark:bg-[#091525]">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="font-display text-3xl md:text-5xl text-header dark:text-white mb-6 leading-tight">
          Try it on your real portfolio for a month.
        </h2>
        <p className="text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed max-w-lg mx-auto mb-10">
          Import a property in under 10 minutes. Or click around the demo first. Either way, no card and no setup call required.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-header text-white px-12 py-5 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
        >
          Open my first property →
        </Link>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-5 italic">
          Includes the cron, the inbox, the cases workspace, the owner portal — everything.
        </p>
      </div>
    </section>
  );
}
