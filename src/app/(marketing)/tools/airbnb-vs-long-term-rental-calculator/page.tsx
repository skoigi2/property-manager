import type { Metadata } from "next";
import { AirbnbVsLtrCalculator } from "@/components/calculator/AirbnbVsLtrCalculator";

const PAGE_URL = "https://groundworkpm.com/tools/airbnb-vs-long-term-rental-calculator";

export const metadata: Metadata = {
  title: "Airbnb vs Long-Term Rental Calculator — Compare True Profitability | GroundWorkPM",
  description:
    "Free Airbnb vs long-term rental calculator. Compare net operating income using real operating costs, find your Airbnb breakeven occupancy, and stress-test your short-term rental strategy before you commit.",
  keywords: [
    "airbnb vs long term rental calculator",
    "airbnb vs renting calculator",
    "airbnb occupancy calculator",
    "airbnb profitability calculator",
    "airbnb breakeven occupancy",
    "airbnb or long term rental",
    "airbnb investment calculator",
    "short term rental calculator",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Should You Airbnb It or Rent It Out Long-Term? Free Calculator",
    description:
      "Compare the true profitability of Airbnb vs long-term renting using real operating costs — and discover the occupancy rate Airbnb needs just to break even.",
    url: PAGE_URL,
    siteName: "GroundWorkPM",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Airbnb vs Long-Term Rental Calculator",
    description:
      "Find the occupancy rate Airbnb needs to beat traditional renting — free, no signup required.",
  },
};

// FAQ content drives both the visible accordion and the FAQPage JSON-LD,
// so the structured data can never drift from what's on the page.
const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Airbnb more profitable than long-term renting?",
    a: "Sometimes — but not as often as gross numbers suggest. Airbnb usually generates higher gross revenue, but it also carries much higher operating costs: cleaning every turnover, utilities, supplies, platform fees, lodging taxes, furnishing replacement, and management fees of 15–25% instead of 8–12%. The honest comparison is net operating income (NOI), not gross income, and it depends heavily on the occupancy your specific market can sustain year-round. This calculator solves for the exact occupancy rate where Airbnb merely matches long-term renting, so you can judge whether your market clears that bar with room to spare.",
  },
  {
    q: "What occupancy rate do I need for Airbnb?",
    a: "It depends entirely on your nightly rate and cost structure — which is why a single rule of thumb is misleading. Enter your assumptions above and the calculator computes your personal breakeven occupancy: the rate at which Airbnb's net profit equals a long-term tenancy. As a guide, if your breakeven is below 40%, Airbnb has a strong advantage; between 40–60%, either strategy can work; above 70%, long-term renting usually offers a better risk-adjusted return, because small demand downturns wipe out the advantage.",
  },
  {
    q: "Is Airbnb worth the extra work?",
    a: "Only you can price your own time, which is why this calculator includes a 'hassle premium' — the extra monthly profit Airbnb must generate before guest messages, pricing management, cleaning coordination, and turnover logistics feel worthwhile. A short-term rental at 65% occupancy with 3-night average stays means roughly 80 turnovers a year: 80 cleans, 160 check-ins and check-outs, and continuous communication. That isn't passive income — it's a hospitality business. If Airbnb's edge over long-term renting is smaller than your hassle premium, long-term renting is the rational choice.",
  },
  {
    q: "How accurate is this calculator?",
    a: "It's as accurate as your assumptions. The arithmetic follows standard real-estate investment analysis — effective gross income, operating expenses, and net operating income — and treats Airbnb and long-term rental as two separate businesses with their own cost structures. It does not include financing costs, income taxes, or appreciation, and it can't predict your market's seasonality. Use realistic, full-year average figures (tools like AirDNA or comparable local listings help), and use the built-in stress tests to see how sensitive your result is to occupancy and rate declines.",
  },
  {
    q: "Should I hire a property manager?",
    a: "For long-term rentals, a manager typically costs 8–12% of collected rent and removes most of the day-to-day workload — often worth it for remote or overseas owners. For Airbnb, full-service short-let managers charge 15–25% of revenue because the workload is genuinely heavier. Both options are built into the calculator as separate management fee inputs, so you can compare 'self-managed Airbnb' against 'professionally managed long-term rental' or any other combination and see the real net difference.",
  },
  {
    q: "What expenses should Airbnb hosts include?",
    a: "More than most first-time hosts expect: cleaning per turnover (your cost, regardless of guest cleaning fees), utilities, internet and streaming, consumables and supplies, platform fees, lodging or tourism taxes, short-term rental insurance (typically 30–50% above landlord cover), higher repairs and maintenance from heavier wear, an annual furnishing replacement reserve, HOA or service charges, licences and permits, and management fees if you outsource. Omitting the furnishing reserve and true cleaning costs is the most common reason hosts overestimate Airbnb profitability.",
  },
];

function JsonLd() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const appSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Airbnb vs Long-Term Rental Calculator",
    url: PAGE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free calculator comparing the net profitability of Airbnb short-term rental versus long-term renting, including breakeven occupancy analysis and stress testing.",
    publisher: {
      "@type": "Organization",
      name: "GroundWorkPM",
      url: "https://groundworkpm.com",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
    </>
  );
}

export default function AirbnbVsLtrCalculatorPage() {
  return (
    <main className="pt-28 pb-20 px-4 sm:px-6">
      <JsonLd />
      <div className="max-w-6xl mx-auto">
        {/* ── Hero (server-rendered, indexable without JS) ── */}
        <header className="max-w-3xl mx-auto text-center mb-12">
          <p className="text-gold-dark dark:text-gold text-label font-semibold uppercase mb-4">
            Free calculator · No signup required
          </p>
          <h1 className=" text-h1 sm:text-display text-header dark:text-white ">
            Should You Airbnb It or Rent It Out Long-Term?
          </h1>
          <p className="text-body-lg text-gray-600 dark:text-gray-300 mt-5 ">
            Compare the true profitability of both strategies using real operating costs and discover the
            occupancy rate Airbnb needs to beat traditional renting.
          </p>
          <p className="text-body text-gray-500 dark:text-gray-400 mt-3">
            Most investors compare gross income. Smart investors compare net income, risk, and operational complexity.
          </p>
        </header>

        {/* ── Interactive calculator ── */}
        <AirbnbVsLtrCalculator />

        {/* ── SEO copy: methodology (server-rendered) ── */}
        <section aria-labelledby="method-heading" className="mt-16 max-w-3xl mx-auto">
          <h2 id="method-heading" className=" text-h1 text-header dark:text-white mb-4">
            How this Airbnb vs long-term rental calculator works
          </h2>
          <div className="space-y-4 text-body text-gray-600 dark:text-gray-300 ">
            <p>
              This calculator treats short-term and long-term rental as <strong>two completely separate businesses</strong>.
              It never estimates Airbnb income from monthly rent, or rent from nightly rates — a shortcut that makes most
              online comparisons useless. Each strategy gets its own revenue assumptions, operating costs, and risk profile.
            </p>
            <p>
              For the long-term rental, it computes <strong>effective gross income</strong> (rent net of vacancy), subtracts
              management fees, property taxes, insurance, repairs, a capital expenditure reserve, and service charges to
              arrive at <strong>net operating income (NOI)</strong>. For Airbnb, it builds revenue from nightly rate ×
              booked nights, then subtracts per-turnover cleaning, utilities, supplies, platform fees, lodging taxes,
              short-let management, furnishing replacement, and the same property-level costs.
            </p>
            <p>
              The headline insight is <strong>breakeven occupancy</strong> — the exact occupancy rate at which Airbnb&apos;s
              net profit merely equals the long-term result. If your market can&apos;t sustain comfortably more than that
              level all year, the extra work of short-term letting isn&apos;t buying you anything. The stress-test table
              then shows how quickly the Airbnb advantage erodes when occupancy slips, nightly rates soften, or costs rise.
            </p>
          </div>
        </section>

        {/* ── FAQ (server-rendered, matches FAQPage schema) ── */}
        <section aria-labelledby="faq-heading" className="mt-16 max-w-3xl mx-auto">
          <h2 id="faq-heading" className=" text-h1 text-header dark:text-white mb-6">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl px-5 sm:px-6 py-4 open:shadow-card transition-shadow"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none text-body sm:text-body-lg font-medium text-header dark:text-white">
                  <span>{f.q}</span>
                  <span className="ml-4 text-gold transition-transform duration-200 group-open:rotate-45 text-h2 " aria-hidden="true">+</span>
                </summary>
                <p className="text-body text-gray-600 dark:text-gray-300 mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Disclaimer ── */}
        <p className="mt-14 max-w-3xl mx-auto text-caption text-gray-400 dark:text-gray-500 text-center">
          This calculator provides estimates only and should not replace professional financial, tax, or legal advice.
          Actual results depend on market conditions, local regulations, operating performance, and execution.
        </p>
      </div>
    </main>
  );
}
