import Link from "next/link";

export function MarketingHero() {
  return (
    <section className="pt-36 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <span className="inline-block bg-gold/10 dark:bg-gold/15 text-gold-dark text-xs font-semibold font-sans px-4 py-1.5 rounded-full mb-8 border border-gold/20">
          30-day free trial · No credit card required
        </span>

        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-header dark:text-white leading-[1.05] tracking-tight mb-6 max-w-3xl mx-auto">
          The property platform that <span className="text-gold">updates itself.</span>
        </h1>

        <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-sans leading-relaxed max-w-2xl mx-auto mb-10">
          Mark an invoice paid and the owner statement is current. Assign a vendor and the case advances itself. No manual refresh.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-header text-white px-10 py-4 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
          >
            Automate my portfolio →
          </Link>
          <Link
            href="/signup?demo=al-seef"
            className="text-gray-500 dark:text-gray-300 hover:text-header dark:hover:text-white px-8 py-4 rounded-xl font-medium text-base transition-colors border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/25"
          >
            Sign up with demo data
          </Link>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-5">
          Built for agencies managing more than 5 properties for more than one owner.
        </p>
      </div>
    </section>
  );
}
