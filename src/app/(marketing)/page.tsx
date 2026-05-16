import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LandingThemeProvider } from "@/components/landing/LandingThemeProvider";
import { LandingNav } from "@/components/landing/LandingNav";

export const metadata: Metadata = {
  title: "Groundwork PM — Professional Property Management Software",
  description:
    "Track income, expenses, occupancy, maintenance, and owner reporting in one premium platform. Built for professional property managers worldwide. 30-day free trial.",
  alternates: {
    canonical: "https://groundworkpm.com",
  },
  openGraph: {
    title: "Groundwork PM — Professional Property Management Software",
    description:
      "Track income, expenses, occupancy, maintenance, and owner reporting in one premium platform. Built for professional property managers worldwide.",
    url: "https://groundworkpm.com",
    siteName: "Groundwork PM",
    type: "website",
    images: [
      {
        url: "https://groundworkpm.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Groundwork PM — Professional Property Management Software",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Groundwork PM — Professional Property Management Software",
    description: "Professional property management for modern operators. 30-day free trial.",
    images: ["https://groundworkpm.com/og-image.png"],
  },
};

// ─── Trust bar ────────────────────────────────────────────────────────────────

function TrustBar() {
  return (
    <section className="py-10 border-y border-gold/10 dark:border-white/10 bg-white dark:bg-[#111F30]">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <p className="text-sm font-sans text-gray-500 dark:text-gray-400 leading-relaxed">
          Built for modern property managers worldwide — with instant access to demo properties and a 30-day free trial.
        </p>
      </div>
    </section>
  );
}

// ─── Dashboard mockup ─────────────────────────────────────────────────────────

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
        {/* Header row */}
        <div className="flex justify-between items-center mb-5">
          <span className="font-display text-sm text-header dark:text-white">Dashboard</span>
          <span className="text-xs font-sans text-gray-400 bg-white dark:bg-[#162032] px-3 py-1.5 rounded-lg border border-gray-100 dark:border-white/10">
            April 2025
          </span>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Monthly Income */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Monthly Income</p>
            <p className="text-xl font-display text-header dark:text-white">$487,500</p>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-income bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-income inline-block" />
              +8% vs last month
            </span>
          </div>

          {/* Occupancy Rate */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Occupancy Rate</p>
            <p className="text-xl font-display text-header dark:text-white">92%</p>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: "92%" }} />
            </div>
          </div>

          {/* Pending Maintenance */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Pending Maintenance</p>
            <p className="text-xl font-display text-gold-dark">3</p>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full font-sans">
              2 overdue
            </span>
          </div>

          {/* Owner Reports */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10 shadow-card">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-sans mb-1">Owner Reports</p>
            <p className="text-xl font-display text-header dark:text-white">12</p>
            <p className="text-[10px] text-gray-400 font-sans mt-2">Sent this month</p>
          </div>
        </div>

        {/* Two-panel row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Recent Income */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-header dark:text-white">Recent Income</span>
              <span className="text-[10px] text-gold font-sans">View all →</span>
            </div>
            {[
              { unit: "Unit 4A — Rent", amount: "$4,500" },
              { unit: "Unit 2B — Rent", amount: "$3,850" },
              { unit: "Unit 7C — Rent", amount: "$5,200" },
            ].map((row) => (
              <div key={row.unit} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-white/5 last:border-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-sans">{row.unit}</span>
                <span className="text-xs font-semibold text-income font-sans">{row.amount}</span>
              </div>
            ))}
          </div>

          {/* Rent Collection */}
          <div className="bg-white dark:bg-[#162032] rounded-xl p-4 border border-gray-100 dark:border-white/10">
            <p className="text-xs font-semibold text-header dark:text-white mb-3">Rent Collection</p>
            <div className="w-full h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-income/70" style={{ flex: 8 }} />
              <div className="h-full bg-gold/60" style={{ flex: 1 }} />
              <div className="h-full bg-expense/60" style={{ flex: 1 }} />
            </div>
            <div className="flex gap-3 mt-2.5 flex-wrap">
              {[
                { color: "bg-income/70", label: "8 paid" },
                { color: "bg-gold/60", label: "1 pending" },
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

// ─── Outcome card ─────────────────────────────────────────────────────────────

function OutcomeCard({ icon, heading, body }: { icon: React.ReactNode; heading: string; body: string }) {
  return (
    <div className="bg-white dark:bg-[#162032] rounded-2xl p-8 border border-gray-100 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-shadow group">
      <div className="w-14 h-14 bg-gold/10 dark:bg-gold/15 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gold/15 dark:group-hover:bg-gold/20 transition-colors">
        {icon}
      </div>
      <h3 className="font-display text-xl text-header dark:text-white mb-3 leading-snug">{heading}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">{body}</p>
    </div>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────

function PricingCard({
  name, monthlyPrice, annualPrice, properties, features, highlight,
}: {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  properties: string;
  features: string[];
  highlight?: boolean;
}) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RootPage() {
  const session = await auth();
  if (session) {
    if (session.user.role === "OWNER") redirect("/report");
    redirect("/dashboard");
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://groundworkpm.com/#organization",
        name: "Groundwork PM",
        url: "https://groundworkpm.com",
        logo: "https://groundworkpm.com/logo.svg",
        description:
          "Professional property management software for modern property managers worldwide.",
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://groundworkpm.com/#software",
        name: "Groundwork PM",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://groundworkpm.com",
        publisher: { "@id": "https://groundworkpm.com/#organization" },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "30-day free trial, no credit card required",
        },
      },
    ],
  };

  return (
    <LandingThemeProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-cream dark:bg-[#0C1B2E] font-sans">
        <LandingNav />

        {/* ── Hero ── */}
        <section className="pt-36 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-gold/10 dark:bg-gold/15 text-gold-dark text-xs font-semibold font-sans px-4 py-1.5 rounded-full mb-8 border border-gold/20">
              30-day free trial · No credit card required
            </span>
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl text-header dark:text-white leading-[1.05] tracking-tight mb-6 max-w-3xl mx-auto">
              Professional Property Management Software{" "}
              <span className="text-gold">for Modern Property Managers</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 font-sans leading-relaxed max-w-2xl mx-auto mb-10">
              Track income and expenses, monitor occupancy, manage maintenance, and deliver professional owner reports — all in one platform designed for serious operators.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="bg-header text-white px-10 py-4 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
              >
                Start Free Trial →
              </Link>
              <Link
                href="/pricing"
                className="text-gray-500 dark:text-gray-300 hover:text-header dark:hover:text-white px-8 py-4 rounded-xl font-medium text-base transition-colors border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/25"
              >
                View pricing
              </Link>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-5">
              30 days free · No card required · Cancel anytime
            </p>
          </div>

          {/* Dashboard mockup */}
          <div className="mt-16 max-w-3xl mx-auto">
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 font-sans tracking-widest uppercase mb-4">
              Live dashboard preview
            </p>
            <DashboardMockup />
          </div>
        </section>

        {/* ── Trust bar ── */}
        <TrustBar />

        {/* ── Outcomes ── */}
        <section id="outcomes" className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="font-display text-4xl text-header dark:text-white mb-4">
                What changes when you use Groundwork PM
              </h2>
              <p className="text-gray-500 dark:text-gray-400 font-sans text-base max-w-xl mx-auto">
                Built around the outcomes that matter to property managers — not a list of software features.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <OutcomeCard
                icon={
                  <svg className="w-7 h-7 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                heading="Reduce rent collection delays"
                body="See exactly who has paid, who hasn't, and how long arrears have been outstanding. Chase systematically, not by memory."
              />
              <OutcomeCard
                icon={
                  <svg className="w-7 h-7 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
                heading="Know your true property profitability"
                body="Income minus expenses per property per month — with automatic management fee deductions and net owner returns calculated for you."
              />
              <OutcomeCard
                icon={
                  <svg className="w-7 h-7 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                heading="Deliver professional owner reports"
                body="Generate polished PDF statements for landlords in seconds. Itemised income, expenses, and fees — ready to send from within the platform."
              />
              <OutcomeCard
                icon={
                  <svg className="w-7 h-7 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                heading="Centralize maintenance and tenant visibility in one system"
                body="Tenants can submit maintenance requests and view rent payment status through a secure portal, while property managers manage assignments, costs, and resolution workflows in real time."
              />
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="py-24 px-6 bg-white dark:bg-[#0C1B2E] border-y border-gray-100 dark:border-white/10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl text-header dark:text-white mb-4">
                Up and running in three steps
              </h2>
              <p className="text-gray-500 dark:text-gray-400 font-sans text-base max-w-md mx-auto">
                No lengthy onboarding. No data entry before you can explore. Demo properties are waiting for you from day one.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connector line — desktop only */}
              <div className="hidden md:block absolute top-8 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-gold/20" />

              {[
                {
                  step: "01",
                  title: "Add Your Properties",
                  body: "Import from Excel or add manually. Set currencies, team members, and units in minutes.",
                  icon: (
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  ),
                },
                {
                  step: "02",
                  title: "Track Operations Daily",
                  body: "Log income, expenses, maintenance jobs, and tenant changes as they happen.",
                  icon: (
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  ),
                },
                {
                  step: "03",
                  title: "Send Professional Reports",
                  body: "Generate owner PDF reports, issue invoices, and share tenant statements from one screen.",
                  icon: (
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  ),
                },
              ].map(({ step, title, body, icon }) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  <div className="w-16 h-16 bg-header rounded-2xl flex items-center justify-center mb-6 shadow-lg z-10">
                    {icon}
                  </div>
                  <span className="text-xs font-mono text-gold-dark tracking-widest mb-2">{step}</span>
                  <h3 className="font-display text-xl text-header dark:text-white mb-3">{title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing preview ── */}
        <section className="py-20 px-6 bg-white dark:bg-[#111F30] border-b border-gray-100 dark:border-white/10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl text-header dark:text-white mb-3">Simple, transparent pricing</h2>
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
                features={[
                  "Unlimited units per property",
                  "Rent & income tracking",
                  "Owner reports & invoices",
                  "Tenant management",
                  "Maintenance logging",
                  "Email support",
                ]}
              />
              <PricingCard
                name="Growth"
                monthlyPrice={199}
                annualPrice={1990}
                properties="Up to 10 properties"
                highlight
                features={[
                  "Everything in Starter",
                  "Multi-property dashboard",
                  "Airbnb / short-let tracking",
                  "Cash flow forecasting",
                  "Compliance certificates",
                  "Team members & roles",
                ]}
              />
              <PricingCard
                name="Pro"
                monthlyPrice={399}
                annualPrice={3990}
                properties="Unlimited properties"
                features={[
                  "Everything in Growth",
                  "Unlimited team members",
                  "Asset register & schedules",
                  "Configurable tax rules",
                  "Property import / export",
                  "Priority support",
                ]}
              />
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-28 px-6 bg-cream-dark dark:bg-[#091525]">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-4xl md:text-5xl text-header dark:text-white mb-6 leading-tight">
              Start Managing Smarter<br />From Day One
            </h2>
            <p className="text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed max-w-lg mx-auto mb-10">
              Access sample properties instantly, explore the full platform, and experience how professional property management should feel — with your free 30-day trial.
            </p>
            <Link
              href="/signup"
              className="inline-block bg-header text-white px-12 py-5 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
            >
              Start Free Trial →
            </Link>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-5">
              No credit card · No commitment · Cancel anytime
            </p>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#091525] py-10 px-6">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BrandLogo size={24} />
              <span className="font-display text-sm text-header dark:text-white">Groundwork PM</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500 font-sans">
              <Link href="/pricing" className="hover:text-header dark:hover:text-white transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-header dark:hover:text-white transition-colors">Sign in</Link>
              <Link href="/signup" className="hover:text-header dark:hover:text-white transition-colors">Sign up</Link>
              <Link href="/terms" className="hover:text-header dark:hover:text-white transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-header dark:hover:text-white transition-colors">Privacy</Link>
              <Link href="/refund" className="hover:text-header dark:hover:text-white transition-colors">Refund Policy</Link>
              <a href="mailto:support@groundworkpm.com" className="hover:text-header dark:hover:text-white transition-colors">Support</a>
            </div>
            <p className="text-xs text-gray-300 dark:text-gray-600 font-sans">
              © {new Date().getFullYear()} Groundwork PM
            </p>
          </div>
        </footer>
      </div>
    </LandingThemeProvider>
  );
}
