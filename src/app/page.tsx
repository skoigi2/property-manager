import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/ui/BrandLogo";

export const metadata: Metadata = {
  title: "Groundwork PM — Property Management Analytics & Financial Tracking",
  description:
    "Track rent, generate owner reports, manage maintenance and compliance for your property portfolio. Property insights. Built on solid groundwork. 30-day free trial.",
  openGraph: {
    title: "Groundwork PM — Property Management Analytics & Financial Tracking",
    description:
      "Track rent, invoices, maintenance, and compliance. Built for landlords and agencies worldwide.",
    url: "https://groundworkpm.com",
    siteName: "Groundwork PM",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Groundwork PM — Property Management Analytics & Financial Tracking",
    description: "Track rent, invoices, maintenance, and compliance. 30-day free trial.",
  },
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandLogo size={32} />
          <span className="font-display text-lg text-header">Groundwork PM</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-sans">
          <a href="#features" className="text-gray-500 hover:text-header transition-colors">Features</a>
          <Link href="/pricing" className="text-gray-500 hover:text-header transition-colors">Pricing</Link>
          <Link href="/login" className="text-gray-500 hover:text-header transition-colors">Sign in</Link>
        </div>

        <Link
          href="/signup"
          className="bg-header text-white text-sm font-sans font-medium px-5 py-2 rounded-lg hover:bg-header/90 transition-colors"
        >
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display text-base text-header mb-2">{title}</h3>
      <p className="text-sm text-gray-500 font-sans leading-relaxed">{desc}</p>
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
        : "bg-white border-gray-100 text-header shadow-sm"
    }`}>
      {highlight && (
        <span className="text-xs font-sans font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-4">
          Most popular
        </span>
      )}
      <h3 className={`font-display text-xl mb-1 ${highlight ? "text-white" : "text-header"}`}>{name}</h3>
      <p className={`text-xs font-sans mb-4 ${highlight ? "text-white/60" : "text-gray-400"}`}>{properties}</p>
      <div className="mb-1">
        <span className={`text-3xl font-display ${highlight ? "text-white" : "text-header"}`}>${monthlyPrice}</span>
        <span className={`text-sm font-sans ml-1 ${highlight ? "text-white/60" : "text-gray-400"}`}>/mo</span>
      </div>
      <p className={`text-xs font-sans mb-6 ${highlight ? "text-white/50" : "text-gray-400"}`}>
        or ${annualPrice}/yr — save 2 months
      </p>
      <ul className="space-y-2 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm font-sans">
            <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlight ? "text-gold" : "text-gold"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className={highlight ? "text-white/80" : "text-gray-600"}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`w-full text-center py-2.5 rounded-lg text-sm font-sans font-semibold transition-colors ${
          highlight
            ? "bg-gold text-header hover:bg-gold/90"
            : "bg-header text-white hover:bg-header/90"
        }`}
      >
        Start free trial
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RootPage() {
  // Redirect logged-in users straight to their dashboard
  const session = await auth();
  if (session) {
    if (session.user.role === "OWNER") redirect("/report");
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-cream font-sans">
      <Nav />

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-gold/10 text-gold-dark text-xs font-semibold font-sans px-4 py-1.5 rounded-full mb-6 border border-gold/20">
            30-day free trial · No credit card required
          </span>
          <h1 className="font-display text-5xl md:text-6xl text-header leading-tight mb-6">
            Property management<br />
            <span className="text-gold">for landlords & agencies</span><br />
            worldwide
          </h1>
          <p className="text-lg text-gray-500 font-sans leading-relaxed max-w-2xl mx-auto mb-10">
            Track rent, generate owner reports, manage maintenance and compliance.
            Built for portfolios of 1 to 100+ units. Multi-currency, multi-property, multi-team.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-header text-white px-8 py-3.5 rounded-xl font-semibold text-sm hover:bg-header/90 transition-colors shadow-lg"
            >
              Start free trial →
            </Link>
            <Link
              href="/pricing"
              className="text-gray-500 hover:text-header px-6 py-3.5 rounded-xl font-medium text-sm transition-colors border border-gray-200 bg-white"
            >
              View pricing
            </Link>
          </div>
          <p className="text-xs text-gray-400 font-sans mt-4">
            30 days free · No card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="py-8 border-y border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-400 font-sans mb-4">
            Trusted by property managers across
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-semibold text-gray-300 tracking-wide uppercase">
            {["Kenya", "Uganda", "Tanzania", "United Kingdom", "UAE", "South Africa"].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl text-header mb-3">
              Everything you need to run your portfolio
            </h2>
            <p className="text-gray-500 font-sans text-sm max-w-xl mx-auto">
              No spreadsheets. No chasing paper. One platform for every aspect of your property business.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              title="Rent & Income Tracking"
              desc="Record rent payments, service charges, and other income. Track arrears, generate invoices, and reconcile deposits. Supports M-Pesa, bank transfer, and more."
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              title="Owner Reports & Invoices"
              desc="Generate professional PDF reports for landlords. Auto-calculate management fees, issue letting invoices, and provide itemised owner statements — monthly or quarterly."
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              title="Maintenance & Assets"
              desc="Log maintenance jobs, track asset registers with warranty dates, and schedule recurring maintenance. Link jobs to expenses and vendors automatically."
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              title="Tenant Management"
              desc="Track leases, renewal stages, and rent history. Generate tenant invoices and share a read-only portal link so tenants can view their statements anytime."
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>}
              title="Multi-Currency & Tax"
              desc="Manage portfolios in KES, USD, GBP, AED, and 6 more currencies. Configurable VAT, GST, and WHT rules per property — or leave blank for tax-free operation."
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              title="Forecasting & Compliance"
              desc="Project cash flow 3, 6, or 12 months ahead. Track insurance renewals, compliance certificates, and lease expiries so nothing slips through the cracks."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing preview ── */}
      <section className="py-20 px-6 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl text-header mb-3">Simple, transparent pricing</h2>
            <p className="text-gray-500 font-sans text-sm">
              Start free for 30 days. No credit card required.{" "}
              <Link href="/pricing" className="text-gold hover:underline">See full feature list →</Link>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <PricingCard
              name="Starter"
              monthlyPrice={29}
              annualPrice={290}
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
              monthlyPrice={79}
              annualPrice={790}
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
              monthlyPrice={149}
              annualPrice={1490}
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

      {/* ── Bottom CTA ── */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl text-header mb-4">
            Ready to take control of your portfolio?
          </h2>
          <p className="text-gray-500 font-sans text-sm mb-8">
            Join property managers worldwide. Set up in minutes, no credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-header text-white px-10 py-4 rounded-xl font-semibold text-sm hover:bg-header/90 transition-colors shadow-lg"
          >
            Start your free 30-day trial →
          </Link>
          <p className="text-xs text-gray-400 font-sans mt-4">
            No credit card · No commitment · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BrandLogo size={24} />
            <span className="font-display text-sm text-header">Groundwork PM</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400 font-sans">
            <Link href="/pricing" className="hover:text-header transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-header transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-header transition-colors">Sign up</Link>
            <a href="mailto:support@groundworkpm.com" className="hover:text-header transition-colors">Support</a>
          </div>
          <p className="text-xs text-gray-300 font-sans">
            © {new Date().getFullYear()} Groundwork PM
          </p>
        </div>
      </footer>
    </div>
  );
}
