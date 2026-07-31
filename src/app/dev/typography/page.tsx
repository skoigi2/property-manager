import { notFound } from "next/navigation";

/**
 * Dev-only type specimen — renders every token in the scale plus the money
 * treatment. Not linked from any nav; returns 404 in production builds.
 * See docs/typography.md for the rules this page demonstrates.
 */

const TOKENS = [
  { cls: "text-display", name: "display", px: "48 / 52", weight: 600, spacing: "-0.025em", use: "Marketing hero H1 (desktop)" },
  { cls: "text-h1", name: "h1", px: "28 / 34", weight: 600, spacing: "-0.02em", use: "Page titles, KPI values, marketing sections" },
  { cls: "text-h2", name: "h2", px: "20 / 28", weight: 600, spacing: "-0.015em", use: "Card & section headings" },
  { cls: "text-h3", name: "h3", px: "16 / 24", weight: 600, spacing: "-0.01em", use: "Sub-headings, modal titles" },
  { cls: "text-body-lg", name: "body-lg", px: "16 / 24", weight: 400, spacing: "0", use: "Marketing paragraphs, lead text" },
  { cls: "text-body", name: "body", px: "14 / 20", weight: 400, spacing: "0", use: "Default UI text, tables, forms" },
  { cls: "text-caption", name: "caption", px: "12 / 16", weight: 400, spacing: "+0.01em", use: "Meta text, timestamps, badges" },
  { cls: "text-label", name: "label", px: "11 / 14", weight: 500, spacing: "+0.05em", use: "Uppercase micro-labels, table headers" },
];

const MONEY_ROWS = [
  { unit: "A14-1C", tenant: "Brenda Bett & Leonard Kip", expected: "80,000.00", received: "80,000.00", variance: "0.00" },
  { unit: "C11-06", tenant: "Carol Chepchirchir", expected: "117,000.00", received: "58,500.00", variance: "-58,500.00" },
  { unit: "C11-07", tenant: "Mary Karimi Nyaga", expected: "117,000.00", received: "117,000.00", variance: "0.00" },
  { unit: "C10-08", tenant: "Karen Rose Wagaki", expected: "1,234,567.89", received: "0.00", variance: "-1,234,567.89" },
];

export default function TypographySpecimen() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-cream p-8 max-w-4xl mx-auto space-y-10">
      <header>
        <p className="text-label uppercase text-gold-dark">Dev specimen</p>
        <h1 className="text-h1 mt-1">Typography scale</h1>
        <p className="text-body text-gray-500 mt-2">
          Eight tokens, Inter only (serif = logo wordmark, mono = keys/refs). Weights 400/500/600.
          No <code className="font-mono text-caption">leading-*</code> / <code className="font-mono text-caption">tracking-*</code> in normal use.
        </p>
      </header>

      <section className="space-y-6">
        {TOKENS.map((t) => (
          <div key={t.name} className="bg-white rounded-xl shadow-card p-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
              <span className="font-mono text-caption text-gold-dark">{t.cls}</span>
              <span className="text-caption text-gray-400">
                {t.px}px · weight {t.weight} · tracking {t.spacing}
              </span>
              <span className="text-caption text-gray-400">— {t.use}</span>
            </div>
            <p className={`${t.cls} break-words`}>The quick brown fox — 1,234,567.89</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-xl shadow-card p-5">
        <h2 className="text-h2 mb-1">Money table</h2>
        <p className="text-caption text-gray-400 mb-4">
          Figures use <code className="font-mono text-caption">tabular-nums</code> so digits align down the column — never mono, never serif.
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-label uppercase text-gray-400 text-left py-2">Unit</th>
              <th className="text-label uppercase text-gray-400 text-left py-2">Tenant</th>
              <th className="text-label uppercase text-gray-400 text-right py-2">Expected</th>
              <th className="text-label uppercase text-gray-400 text-right py-2">Received</th>
              <th className="text-label uppercase text-gray-400 text-right py-2">Variance</th>
            </tr>
          </thead>
          <tbody>
            {MONEY_ROWS.map((r) => (
              <tr key={r.unit} className="border-b border-gray-50">
                <td className="text-body font-medium py-2.5">{r.unit}</td>
                <td className="text-body text-gray-600 py-2.5">{r.tenant}</td>
                <td className="text-body tabular-nums text-right py-2.5">$ {r.expected}</td>
                <td className="text-body tabular-nums text-right py-2.5">$ {r.received}</td>
                <td className={`text-body tabular-nums text-right py-2.5 ${r.variance.startsWith("-") ? "text-expense" : "text-income"}`}>
                  $ {r.variance}
                </td>
              </tr>
            ))}
            <tr>
              <td className="text-body font-semibold py-2.5" colSpan={2}>Total</td>
              <td className="text-body font-semibold tabular-nums text-right py-2.5">$ 1,548,567.89</td>
              <td className="text-body font-semibold tabular-nums text-right py-2.5">$ 255,500.00</td>
              <td className="text-body font-semibold tabular-nums text-right py-2.5 text-expense">-$ 1,293,067.89</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-5 flex items-end gap-8">
          <div>
            <p className="text-label uppercase text-gray-400">KPI value (h1 + tabular)</p>
            <p className="text-h1 tabular-nums mt-1">$ 1,548,568</p>
          </div>
          <div>
            <p className="text-label uppercase text-gray-400">CurrencyDisplay lg (h2)</p>
            <p className="text-h2 tabular-nums mt-1">$ 255,500.00</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-card p-5">
        <h2 className="text-h2 mb-3">Exceptions</h2>
        <p className="font-display font-normal text-h2 text-header">Groundwork PM</p>
        <p className="text-caption text-gray-400 mb-3">↑ DM Serif Display — logo wordmark only</p>
        <p className="font-mono text-caption">gwpm_ak_9f2c…e41b · sha256:ab12cd</p>
        <p className="text-caption text-gray-400">↑ System mono — API keys, tokens, reference codes only. Never money.</p>
      </section>
    </div>
  );
}
