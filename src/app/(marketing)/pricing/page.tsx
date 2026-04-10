"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Nav (reused from landing) ────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-header rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="font-display text-lg text-header">Property Manager</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-sans">
          <Link href="/#features" className="text-gray-500 hover:text-header transition-colors">Features</Link>
          <Link href="/pricing" className="text-header font-medium">Pricing</Link>
          <Link href="/login" className="text-gray-500 hover:text-header transition-colors">Sign in</Link>
        </div>
        <Link href="/signup" className="bg-header text-white text-sm font-sans font-medium px-5 py-2 rounded-lg hover:bg-header/90 transition-colors">
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

// ─── Tick icon ────────────────────────────────────────────────────────────────

function Tick({ muted }: { muted?: boolean }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${muted ? "text-gray-300" : "text-gold"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Feature row ──────────────────────────────────────────────────────────────

type FeatureRowDef = {
  label: string;
  starter: boolean | string;
  growth: boolean | string;
  pro: boolean | string;
};

const FEATURES: { section: string; rows: FeatureRowDef[] }[] = [
  {
    section: "Properties & Units",
    rows: [
      { label: "Properties", starter: "Up to 2", growth: "Up to 10", pro: "Unlimited" },
      { label: "Units per property", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { label: "Property types (long-term & Airbnb)", starter: true, growth: true, pro: true },
      { label: "Multi-currency support", starter: true, growth: true, pro: true },
    ],
  },
  {
    section: "Income & Finances",
    rows: [
      { label: "Rent & income tracking", starter: true, growth: true, pro: true },
      { label: "Petty cash management", starter: true, growth: true, pro: true },
      { label: "Expense management with line items", starter: true, growth: true, pro: true },
      { label: "Recurring expenses", starter: true, growth: true, pro: true },
      { label: "Airbnb / short-let income tracking", starter: false, growth: true, pro: true },
      { label: "Configurable tax rules (VAT, WHT)", starter: false, growth: true, pro: true },
    ],
  },
  {
    section: "Reports & Invoices",
    rows: [
      { label: "Owner PDF reports (monthly & quarterly)", starter: true, growth: true, pro: true },
      { label: "Tenant rent invoices", starter: true, growth: true, pro: true },
      { label: "Owner fee invoices (mgmt, letting, renewal)", starter: true, growth: true, pro: true },
      { label: "Excel export", starter: true, growth: true, pro: true },
      { label: "Cash flow forecasting (3/6/12 months)", starter: false, growth: true, pro: true },
      { label: "Owner statement by unit", starter: false, growth: true, pro: true },
    ],
  },
  {
    section: "Tenants",
    rows: [
      { label: "Tenant management & lease tracking", starter: true, growth: true, pro: true },
      { label: "Arrears tracking", starter: true, growth: true, pro: true },
      { label: "Renewal workflow", starter: true, growth: true, pro: true },
      { label: "Deposit settlement", starter: true, growth: true, pro: true },
      { label: "Tenant self-service portal", starter: true, growth: true, pro: true },
      { label: "Bulk import (Excel handover)", starter: false, growth: true, pro: true },
    ],
  },
  {
    section: "Maintenance & Compliance",
    rows: [
      { label: "Maintenance job logging", starter: true, growth: true, pro: true },
      { label: "Vendor / contractor registry", starter: true, growth: true, pro: true },
      { label: "Asset register & warranty tracking", starter: false, growth: true, pro: true },
      { label: "Maintenance schedules", starter: false, growth: true, pro: true },
      { label: "Insurance policy tracking", starter: false, growth: true, pro: true },
      { label: "Compliance certificates", starter: false, growth: true, pro: true },
    ],
  },
  {
    section: "Team & Access",
    rows: [
      { label: "Team members", starter: "2", growth: "10", pro: "Unlimited" },
      { label: "Roles (Admin, Manager, Accountant, Owner)", starter: true, growth: true, pro: true },
      { label: "Per-property access control", starter: false, growth: true, pro: true },
      { label: "Multiple organisations", starter: false, growth: false, pro: true },
      { label: "Audit log", starter: false, growth: true, pro: true },
    ],
  },
  {
    section: "Support",
    rows: [
      { label: "Email support", starter: true, growth: true, pro: true },
      { label: "Priority support", starter: false, growth: false, pro: true },
    ],
  },
];

function CellValue({ val }: { val: boolean | string }) {
  if (typeof val === "string") return <span className="text-xs font-sans text-gray-600">{val}</span>;
  return val ? <Tick /> : <Cross />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  const plans = [
    { name: "Starter", monthly: 29,  annualMonthly: 24,  annual: 290  },
    { name: "Growth",  monthly: 79,  annualMonthly: 66,  annual: 790  },
    { name: "Pro",     monthly: 149, annualMonthly: 124, annual: 1490 },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans">
      <Nav />

      {/* ── Header ── */}
      <section className="pt-32 pb-12 px-6 text-center">
        <h1 className="font-display text-4xl text-header mb-3">Simple, transparent pricing</h1>
        <p className="text-gray-500 text-sm max-w-lg mx-auto mb-8">
          Start free for 30 days — no credit card required. Upgrade when you&apos;re ready.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${!annual ? "bg-header text-white" : "text-gray-500 hover:text-header"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${annual ? "bg-header text-white" : "text-gray-500 hover:text-header"}`}
          >
            Annual
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${annual ? "bg-gold text-header" : "bg-gold/10 text-gold-dark"}`}>
              Save 2 months
            </span>
          </button>
        </div>
      </section>

      {/* ── Plan cards ── */}
      <section className="pb-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan, i) => {
            const highlight = i === 1;
            const price = annual ? plan.annualMonthly : plan.monthly;
            const suffix = annual ? "/mo, billed annually" : "/mo";
            return (
              <div key={plan.name} className={`rounded-2xl p-6 border flex flex-col ${
                highlight ? "bg-header border-header shadow-xl" : "bg-white border-gray-100 shadow-sm"
              }`}>
                {highlight && (
                  <span className="text-xs font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-3">
                    Most popular
                  </span>
                )}
                <h2 className={`font-display text-xl mb-4 ${highlight ? "text-white" : "text-header"}`}>{plan.name}</h2>
                <div className="mb-6">
                  <span className={`text-4xl font-display ${highlight ? "text-white" : "text-header"}`}>${price}</span>
                  <span className={`text-xs ml-1 ${highlight ? "text-white/50" : "text-gray-400"}`}>{suffix}</span>
                  {annual && (
                    <p className={`text-xs mt-1 ${highlight ? "text-white/40" : "text-gray-300"}`}>
                      ${plan.annual}/year
                    </p>
                  )}
                </div>
                <Link
                  href={`/signup?plan=${plan.name.toLowerCase()}&billing=${annual ? "annual" : "monthly"}`}
                  className={`w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors mb-4 ${
                    highlight ? "bg-gold text-header hover:bg-gold/90" : "bg-header text-white hover:bg-header/90"
                  }`}
                >
                  Start free trial
                </Link>
                <p className={`text-xs text-center ${highlight ? "text-white/40" : "text-gray-300"}`}>
                  30 days free · No card required
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="pb-20 px-6">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-4 border-b border-gray-100">
            <div className="p-4" />
            {["Starter", "Growth", "Pro"].map((p) => (
              <div key={p} className="p-4 text-center border-l border-gray-100">
                <span className="font-display text-sm text-header">{p}</span>
              </div>
            ))}
          </div>

          {FEATURES.map((section) => (
            <div key={section.section}>
              <div className="bg-cream px-4 py-2.5 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.section}</span>
              </div>
              {section.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-4 border-b border-gray-50 hover:bg-cream/40 transition-colors">
                  <div className="p-3 px-4 text-xs text-gray-600 font-sans flex items-center">{row.label}</div>
                  {(["starter", "growth", "pro"] as const).map((tier) => (
                    <div key={tier} className="p-3 border-l border-gray-50 flex items-center justify-center">
                      <CellValue val={row[tier]} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="pb-20 px-6 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto pt-16">
          <h2 className="font-display text-2xl text-header mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "What happens when my trial ends?",
                a: "Your account moves to read-only mode — you can view all your data but cannot add or edit records. Your data is never deleted. Simply upgrade to continue.",
              },
              {
                q: "Do I need a credit card to start?",
                a: "No. Your 30-day trial is completely free with no card required. You only enter payment details when you decide to upgrade.",
              },
              {
                q: "Can I change plans later?",
                a: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the next billing cycle.",
              },
              {
                q: "What currencies does it support?",
                a: "KES, USD, GBP, EUR, AED, TZS, UGX, ZAR, INR, CHF — with more on request. Each property can have its own currency.",
              },
              {
                q: "Is my data safe?",
                a: "Yes. All data is stored in Supabase (PostgreSQL) with row-level security, encrypted in transit and at rest. We never share or sell your data.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. Cancel from your billing page at any time. You'll keep access until the end of your paid period.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-gray-100 pb-6">
                <h3 className="font-sans font-semibold text-header text-sm mb-2">{q}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-16 px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-display text-2xl text-header mb-3">Ready to get started?</h2>
          <p className="text-gray-500 text-sm mb-6">30 days free. No credit card. No commitment.</p>
          <Link href="/signup" className="inline-block bg-header text-white px-8 py-3.5 rounded-xl font-semibold text-sm hover:bg-header/90 transition-colors shadow-lg">
            Start free trial →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-header rounded-md flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="font-display text-sm text-header">Property Manager</span>
          </Link>
          <p className="text-xs text-gray-300 font-sans">© {new Date().getFullYear()} Property Manager</p>
        </div>
      </footer>
    </div>
  );
}
