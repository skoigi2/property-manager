export function TrustStrip() {
  const markets = ["Middle East", "South Africa", "USA", "Kenya", "UK"];
  return (
    <section className="py-12 border-y border-gold/10 dark:border-white/10 bg-white dark:bg-[#111F30]">
      <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
        <p className="text-sm md:text-base font-sans text-gray-600 dark:text-gray-300 leading-relaxed">
          Built for modern property operations teams across emerging and established markets.
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs md:text-sm font-sans text-gray-400 dark:text-gray-500">
          {markets.map((m, i) => (
            <li key={m} className="flex items-center gap-3">
              <span>{m}</span>
              {i < markets.length - 1 && <span aria-hidden="true">·</span>}
            </li>
          ))}
        </ul>

        <p className="text-xs font-sans text-gray-400 dark:text-gray-500 italic pt-2">
          Used by agencies with one shared standard: every owner gets a current statement, every month.
        </p>
      </div>
    </section>
  );
}
