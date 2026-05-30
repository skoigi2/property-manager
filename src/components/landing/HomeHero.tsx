import Link from "next/link";

export function HomeHero() {
  return (
    <section className="pt-36 pb-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <span className="inline-block bg-gold/10 dark:bg-gold/15 text-gold-dark text-xs font-semibold font-sans px-4 py-1.5 rounded-full mb-8 border border-gold/20">
          30-day free trial · No credit card required
        </span>

        <h1 className="font-display text-4xl md:text-6xl text-header dark:text-white leading-[1.07] tracking-tight mb-6">
          Stop running property operations through{" "}
          <span className="text-gold">WhatsApp and spreadsheets.</span>
        </h1>

        <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-sans leading-relaxed max-w-xl mx-auto mb-10">
          Track rent, maintenance, owner approvals, renewals and reporting from one system — so nothing falls through the cracks as your portfolio grows.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-header text-white px-10 py-4 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
          >
            Start free trial →
          </Link>
          <Link
            href="/contact?intent=demo"
            className="text-gray-500 dark:text-gray-300 hover:text-header dark:hover:text-white px-8 py-4 rounded-xl font-medium text-base transition-colors border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/25"
          >
            Book a 15-minute demo
          </Link>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-6">
          Built for professional property managers, agencies and operators managing multiple properties.
        </p>
      </div>
    </section>
  );
}
