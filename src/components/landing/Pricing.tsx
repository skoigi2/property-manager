import Link from "next/link";

interface PricingCardProps {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  properties: string;
  features: string[];
  highlight?: boolean;
}

function PricingCard({ name, monthlyPrice, annualPrice, properties, features, highlight }: PricingCardProps) {
  return (
    <div className={`rounded-2xl p-6 border flex flex-col ${
      highlight
        ? "bg-header border-header text-white shadow-xl scale-105"
        : "bg-white dark:bg-[#162032] border-gray-100 dark:border-white/10 text-header shadow-sm"
    }`}>
      {highlight && (
        <span className="text-xs font-sans font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-4">
          Most popular
        </span>
      )}
      <h3 className={`font-display text-xl mb-1 ${highlight ? "text-white" : "text-header dark:text-white"}`}>{name}</h3>
      <p className={`text-xs font-sans mb-4 ${highlight ? "text-white/60" : "text-gray-400"}`}>{properties}</p>
      <div className="mb-1">
        <span className={`text-3xl font-display ${highlight ? "text-white" : "text-header dark:text-white"}`}>${monthlyPrice}</span>
        <span className={`text-sm font-sans ml-1 ${highlight ? "text-white/60" : "text-gray-400"}`}>/mo</span>
      </div>
      <p className={`text-xs font-sans mb-6 ${highlight ? "text-white/50" : "text-gray-400"}`}>
        or ${annualPrice}/yr — save 2 months
      </p>
      <ul className="space-y-2 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm font-sans">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className={highlight ? "text-white/80" : "text-gray-600 dark:text-gray-300"}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`w-full text-center py-2.5 rounded-lg text-sm font-sans font-semibold transition-colors ${
          highlight
            ? "bg-gold text-header hover:bg-gold/90"
            : "bg-header dark:bg-gold text-white dark:text-header hover:bg-header/90 dark:hover:bg-gold/90"
        }`}
      >
        Start free trial
      </Link>
    </div>
  );
}

// Picked feature list (variant b) — applied as the Growth tier baseline.
// Starter trims the last two; Pro extends with team + tax.
const STARTER_FEATURES = [
  "Unlimited units per property",
  "Automatic rent posting + owner statement refresh",
  "Tenant portal (shareable, no login)",
  "Owner approvals via email magic link",
  "Daily cron for lease / insurance / compliance deadlines",
];

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  "Inbox queue with one-click suggested actions",
  "3 / 6 / 12 month cashflow forecast",
];

const PRO_FEATURES = [
  "Everything in Growth",
  "Unlimited team members",
  "Asset register & schedules",
  "Configurable tax rules",
  "Property import / export",
  "Priority support",
];

export function Pricing() {
  return (
    <section className="py-20 px-6 bg-white dark:bg-[#111F30] border-b border-gray-100 dark:border-white/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-3 max-w-2xl mx-auto">
          <p className="font-display text-lg md:text-xl text-header dark:text-white">
            Compare to the cost of one missed lease renewal.
          </p>
        </div>
        <div className="text-center mb-12">
          <h2 className="font-display text-2xl md:text-3xl text-header dark:text-white mb-3">Simple, transparent pricing</h2>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-sm">
            Start free for 30 days. No credit card required.{" "}
            <Link href="/pricing" className="text-gold hover:underline">See full feature list →</Link>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <PricingCard
            name="Starter"
            monthlyPrice={79}
            annualPrice={790}
            properties="Up to 2 properties"
            features={STARTER_FEATURES}
          />
          <PricingCard
            name="Growth"
            monthlyPrice={199}
            annualPrice={1990}
            properties="Up to 10 properties"
            highlight
            features={GROWTH_FEATURES}
          />
          <PricingCard
            name="Pro"
            monthlyPrice={399}
            annualPrice={3990}
            properties="Unlimited properties"
            features={PRO_FEATURES}
          />
        </div>
      </div>
    </section>
  );
}
