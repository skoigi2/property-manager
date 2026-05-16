"use client";

import { useState } from "react";
import Link from "next/link";
import { useLandingTheme } from "@/components/landing/LandingThemeProvider";
import { Check } from "lucide-react";

// ─── Tick / cross icons ──────────────────────────────────────────────────────

function Tick({ muted }: { muted?: boolean }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${muted ? "text-gray-300 dark:text-white/20" : "text-gold"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Dash() {
  return <span className="text-gray-300 dark:text-white/20 text-lg">—</span>;
}

// ─── Feature matrix (slimmed — see plan §7) ──────────────────────────────────
//
// Only rows backed by REAL code gates are tier-differentiated:
//   - Properties      (PROPERTY_LIMITS in src/lib/paddle.ts)
//   - Team members    (TEAM_LIMITS in src/lib/paddle.ts, canAddUser() guard)
//   - Priority support (service tier, no code gate but reasonable to differentiate)
//
// Everything else renders as 3-checkmark rows. This is intentional and
// reinforces the "Why no feature gates?" message above the matrix.

type FeatureRowDef = {
  label: string;
  starter: boolean | string;
  growth: boolean | string;
  pro: boolean | string;
};

const FEATURES: { section: string; rows: FeatureRowDef[] }[] = [
  {
    section: "Capacity",
    rows: [
      { label: "Properties", starter: "Up to 2", growth: "Up to 10", pro: "Unlimited" },
      { label: "Units per property", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { label: "Team members", starter: "1", growth: "Up to 10", pro: "Unlimited" },
    ],
  },
  {
    section: "Properties & Units",
    rows: [
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
      { label: "Airbnb / short-let income tracking", starter: true, growth: true, pro: true },
      { label: "Configurable tax rules (VAT, WHT)", starter: true, growth: true, pro: true },
    ],
  },
  {
    section: "Reports & Invoices",
    rows: [
      { label: "Owner PDF reports", starter: true, growth: true, pro: true },
      { label: "Tenant rent invoices", starter: true, growth: true, pro: true },
      { label: "Owner fee invoices (mgmt, letting, renewal)", starter: true, growth: true, pro: true },
      { label: "Excel export", starter: true, growth: true, pro: true },
      { label: "Cash flow forecasting (3 / 6 / 12 months)", starter: true, growth: true, pro: true },
      { label: "Owner statement by unit", starter: true, growth: true, pro: true },
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
      { label: "Bulk import (Excel handover)", starter: true, growth: true, pro: true },
    ],
  },
  {
    section: "Maintenance & Compliance",
    rows: [
      { label: "Cases workspace + magic-link approvals", starter: true, growth: true, pro: true },
      { label: "Vendor / contractor registry", starter: true, growth: true, pro: true },
      { label: "Asset register & warranty tracking", starter: true, growth: true, pro: true },
      { label: "Maintenance schedules", starter: true, growth: true, pro: true },
      { label: "Insurance policy tracking", starter: true, growth: true, pro: true },
      { label: "Compliance certificates", starter: true, growth: true, pro: true },
    ],
  },
  {
    section: "Team & Access",
    rows: [
      { label: "Roles (Admin, Manager, Accountant, Owner)", starter: true, growth: true, pro: true },
      { label: "Per-property access control", starter: true, growth: true, pro: true },
      { label: "Multiple organisations", starter: true, growth: true, pro: true },
      { label: "Audit log", starter: true, growth: true, pro: true },
    ],
  },
  {
    section: "Operational layer",
    rows: [
      { label: "Operational Inbox (daily queue)", starter: true, growth: true, pro: true },
      { label: "Daily cron — lease / insurance / compliance / arrears alerts", starter: true, growth: true, pro: true },
      { label: "Smart Reminders (proactive hints)", starter: true, growth: true, pro: true },
      { label: "Case workflow + per-stage SLAs", starter: true, growth: true, pro: true },
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
  if (typeof val === "string") return <span className="text-xs font-sans text-gray-600 dark:text-gray-300">{val}</span>;
  return val ? <Tick /> : <Dash />;
}

// ─── Plan data ───────────────────────────────────────────────────────────────

const PLANS = [
  { name: "Starter", monthly: 79,  annualMonthly: 66,  annual: 790  },
  { name: "Growth",  monthly: 199, annualMonthly: 166, annual: 1990 },
  { name: "Pro",     monthly: 399, annualMonthly: 333, annual: 3990 },
] as const;

const STARTER_BULLETS = [
  "Everything in Groundwork PM",
  "Up to 2 properties · unlimited units",
  "1 team member",
  "Tenant portal · magic-link approvals · daily expiry cron",
];

const GROWTH_BULLETS = [
  "Everything in Groundwork PM",
  "Up to 10 properties · unlimited units",
  "Up to 10 team members",
  "Inbox queue with one-click suggested actions",
  "3 / 6 / 12 month cashflow forecast",
  "Multi-property dashboard",
];

const PRO_BULLETS = [
  "Everything in Groundwork PM",
  "Unlimited properties · unlimited team members",
  "Multiple organisations",
  "Priority support",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const { dark } = useLandingTheme();

  const toggleBg = dark ? "bg-[#111F30] border-white/10" : "bg-white border-gray-200";
  const tableBg  = dark ? "bg-[#111F30] border-white/10" : "bg-white border-gray-100";

  return (
    <>
      {/* ── Hero — variant (c): bold/contrarian, leads with what we don't do ── */}
      <section className="pt-32 pb-10 px-6 text-center">
        <h1 className="font-display text-3xl md:text-5xl text-header dark:text-white leading-tight mb-5 max-w-3xl mx-auto">
          Pricing for agencies, not for everyone.
        </h1>
        <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-sans max-w-2xl mx-auto leading-relaxed">
          Most SaaS gates features arbitrarily. We gate by portfolio size. Every plan includes every automation. You pay for capacity, not for a workflow you should already have.
        </p>
      </section>

      {/* ── Framing line (locked from homepage) ── */}
      <section className="pb-6 px-6 text-center">
        <p className="font-display text-lg md:text-xl text-header dark:text-white">
          Compare to the cost of one missed lease renewal.
        </p>
      </section>

      {/* ── Billing toggle ── */}
      <section className="pb-12 px-6 text-center">
        <div className={`inline-flex items-center gap-3 border rounded-xl p-1 ${toggleBg}`}>
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              !annual
                ? "bg-header dark:bg-gold text-white dark:text-header"
                : "text-gray-500 dark:text-gray-400 hover:text-header dark:hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              annual
                ? "bg-header dark:bg-gold text-white dark:text-header"
                : "text-gray-500 dark:text-gray-400 hover:text-header dark:hover:text-white"
            }`}
          >
            Annual
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${annual ? "bg-gold text-header" : "bg-gold/10 text-gold-dark"}`}>
              Save 2 months
            </span>
          </button>
        </div>
      </section>

      {/* ── Tier cards (Growth dominant; Starter de-emphasised; Pro standard) ── */}
      <section className="pb-12 px-6">
        {/* Mobile: Growth → Pro → Starter (re-ordered via flex order classes) */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:items-center">
          {/* Starter — muted */}
          <div className="order-3 md:order-1 rounded-2xl p-5 border bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/10 flex flex-col">
            <h2 className="font-display text-lg text-gray-700 dark:text-gray-300 mb-1">Starter</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mb-4">For smaller portfolios</p>
            <PriceBlock plan={PLANS[0]} annual={annual} muted />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic mb-5">Best if you manage 1–2 properties yourself.</p>
            <BulletList bullets={STARTER_BULLETS} muted />
            <Link
              href={`/signup?plan=starter&billing=${annual ? "annual" : "monthly"}`}
              className="w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors mt-auto bg-white dark:bg-white/5 border border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
            >
              Start free trial
            </Link>
          </div>

          {/* Growth — emphasised */}
          <div className="order-1 md:order-2 rounded-2xl p-7 border-2 border-gold-dark bg-header shadow-xl md:scale-105 flex flex-col text-white relative z-10">
            <span className="text-xs font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-3">
              Most chosen
            </span>
            <h2 className="font-display text-2xl mb-1">Growth</h2>
            <p className="text-xs text-white/60 font-sans mb-4">Most agencies start here.</p>
            <PriceBlock plan={PLANS[1]} annual={annual} highlight />
            <BulletList bullets={GROWTH_BULLETS} highlight />
            <Link
              href={`/signup?plan=growth&billing=${annual ? "annual" : "monthly"}`}
              className="w-full text-center py-3 rounded-lg text-sm font-semibold transition-colors mt-auto bg-gold text-header hover:bg-gold/90"
            >
              Start free trial
            </Link>
            <p className="text-xs text-center text-white/40 mt-3">30 days free · No card required</p>
          </div>

          {/* Pro — standard */}
          <div className="order-2 md:order-3 rounded-2xl p-6 border bg-white dark:bg-[#111F30] border-gray-100 dark:border-white/10 shadow-sm flex flex-col">
            <h2 className="font-display text-xl text-header dark:text-white mb-1">Pro</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mb-4">For agencies with multiple teams and portfolios.</p>
            <PriceBlock plan={PLANS[2]} annual={annual} />
            <BulletList bullets={PRO_BULLETS} />
            <Link
              href={`/signup?plan=pro&billing=${annual ? "annual" : "monthly"}`}
              className="w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors mt-auto bg-header dark:bg-gold text-white dark:text-header hover:bg-header/90 dark:hover:bg-gold/90"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      {/* ── Reassurance strip ── */}
      <section className="bg-cream-dark dark:bg-[#091525] py-4 px-6 border-y border-gray-100 dark:border-white/10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-xs text-gray-500 dark:text-gray-400 font-sans text-center">
          <span>Trial ends → read-only access.</span>
          <span className="hidden md:inline text-gray-300 dark:text-white/20">·</span>
          <span>Data stays.</span>
          <span className="hidden md:inline text-gray-300 dark:text-white/20">·</span>
          <span>Cancel anywhere from the billing page.</span>
          <span className="hidden md:inline text-gray-300 dark:text-white/20">·</span>
          <span>Export everything as Excel any time.</span>
        </div>
      </section>

      {/* ── "Why no feature gates?" explainer ── */}
      <section className="bg-white dark:bg-[#0C1B2E] py-10 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-base md:text-lg text-header dark:text-white mb-2">
            Why no feature gates?
          </h2>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
            You shouldn&apos;t have to upgrade to access core property management features. Tiers exist for capacity — properties and team members — not to gate workflows you need.
          </p>
        </div>
      </section>

      {/* ── Feature matrix ── */}
      <section className="pb-20 px-6">
        <div className="max-w-4xl mx-auto mb-8 text-center">
          <h2 className="font-display text-2xl text-header dark:text-white mb-2">
            Every tier includes the full feature set.
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-sans">
            Tiers differ by portfolio size and team headcount.
          </p>
        </div>

        <div className={`max-w-4xl mx-auto border rounded-2xl shadow-sm overflow-hidden ${tableBg}`}>
          {/* Header row */}
          <div className="grid grid-cols-4 border-b border-gray-100 dark:border-white/10">
            <div className="p-4" />
            {(["Starter", "Growth", "Pro"] as const).map((p) => {
              const isGrowth = p === "Growth";
              return (
                <div
                  key={p}
                  className={`p-4 text-center border-l border-gray-100 dark:border-white/10 ${
                    isGrowth ? "bg-gold/10 dark:bg-gold/15 border-l-2 border-r-2 border-gold/30" : ""
                  }`}
                >
                  <span className={`font-display text-sm ${isGrowth ? "text-gold-dark dark:text-gold" : "text-header dark:text-white"}`}>
                    {p}
                  </span>
                </div>
              );
            })}
          </div>

          {FEATURES.map((section) => (
            <div key={section.section}>
              <div className="bg-cream dark:bg-[#091525] px-4 py-2.5 border-b border-gray-100 dark:border-white/10">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{section.section}</span>
              </div>
              {section.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-4 border-b border-gray-50 dark:border-white/5 hover:bg-cream/40 dark:hover:bg-white/5 transition-colors">
                  <div className="p-3 px-4 text-xs text-gray-600 dark:text-gray-300 font-sans flex items-center">{row.label}</div>
                  {(["starter", "growth", "pro"] as const).map((tier) => {
                    const isGrowth = tier === "growth";
                    return (
                      <div
                        key={tier}
                        className={`p-3 border-l border-gray-50 dark:border-white/5 flex items-center justify-center ${
                          isGrowth ? "bg-gold/5 dark:bg-gold/10 border-l-2 border-r-2 border-gold/20" : ""
                        }`}
                      >
                        <CellValue val={row[tier]} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={`pb-20 px-6 border-t ${tableBg}`}>
        <div className="max-w-2xl mx-auto pt-16">
          <h2 className="font-display text-2xl text-header dark:text-white mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "What happens when my trial ends?",
                a: "Your account moves to read-only access. Your data is never deleted. Upgrade to resume writes.",
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
                a: "KES, USD, GBP, EUR, AED, TZS, UGX, ZAR, INR, CHF, BHD, NGN, GHS, ZMW, RWF, OMR, KWD, QAR, SAR — with more on request. Each property can have its own currency.",
              },
              {
                q: "Is my data safe?",
                a: "PostgreSQL with row-level security, encrypted in transit and at rest, hosted on enterprise-grade infrastructure with daily backups. Your data is never shared or sold.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. Cancel from your billing page at any time. You'll keep access until the end of your paid period.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-gray-100 dark:border-white/10 pb-6">
                <h3 className="font-sans font-semibold text-header dark:text-white text-sm mb-2">{q}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA (echo of homepage FinalCTA variant (b)) ── */}
      <section className="py-24 px-6 bg-cream-dark dark:bg-[#091525]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-4xl text-header dark:text-white mb-5 leading-tight">
            Try it on your real portfolio for a month.
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-base leading-relaxed max-w-lg mx-auto mb-8">
            Import a property in under 10 minutes. Or click around the demo first. Either way, no card and no setup call required.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-header text-white px-10 py-4 rounded-xl font-semibold text-base hover:bg-header/90 transition-all shadow-[0_4px_20px_rgba(26,26,46,0.25)] hover:shadow-[0_6px_28px_rgba(26,26,46,0.35)] hover:-translate-y-0.5"
          >
            Open my first property →
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-sans mt-4 italic">
            Includes the cron, the inbox, the cases workspace, the owner portal — everything.
          </p>
        </div>
      </section>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PriceBlockProps {
  plan: { monthly: number; annualMonthly: number; annual: number };
  annual: boolean;
  highlight?: boolean;
  muted?: boolean;
}

function PriceBlock({ plan, annual, highlight, muted }: PriceBlockProps) {
  const price = annual ? plan.annualMonthly : plan.monthly;
  const suffix = annual ? "/mo, billed annually" : "/mo";
  const priceColour = highlight
    ? "text-white"
    : muted
      ? "text-gray-600 dark:text-gray-300"
      : "text-header dark:text-white";
  const suffixColour = highlight ? "text-white/50" : "text-gray-400 dark:text-gray-500";
  const annualLineColour = highlight ? "text-white/40" : "text-gray-300 dark:text-white/30";

  return (
    <div className="mb-4">
      <span className={`text-3xl md:text-4xl font-display ${priceColour}`}>${price}</span>
      <span className={`text-xs ml-1 ${suffixColour}`}>{suffix}</span>
      {annual && <p className={`text-xs mt-1 ${annualLineColour}`}>${plan.annual}/year</p>}
    </div>
  );
}

interface BulletListProps {
  bullets: readonly string[];
  highlight?: boolean;
  muted?: boolean;
}

function BulletList({ bullets, highlight, muted }: BulletListProps) {
  const tickColour = highlight ? "text-gold" : "text-gold";
  const textColour = highlight
    ? "text-white/85"
    : muted
      ? "text-gray-500 dark:text-gray-400"
      : "text-gray-600 dark:text-gray-300";
  return (
    <ul className="space-y-2 mb-6 flex-1">
      {bullets.map((b, i) => (
        <li key={b} className="flex items-start gap-2 text-sm font-sans">
          <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tickColour}`} />
          <span className={textColour}>
            {i === 0 ? <strong className={highlight ? "text-white" : "text-header dark:text-white"}>{b}</strong> : b}
          </span>
        </li>
      ))}
    </ul>
  );
}
