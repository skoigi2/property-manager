"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import toast from "react-hot-toast";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  pricingTier:        string;
  subscriptionStatus: string | null;
  trialEndsAt:        string | null;
  trialDaysLeft:      number;
  isLocked:           boolean;
  propertyCount:      number;
  propertyLimit:      number | null;
  hasStripeCustomer:  boolean;
  hasSubscription:    boolean;
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    key:            "STARTER",
    name:           "Starter",
    monthly:        29,
    annualMonthly:  24,
    annual:         290,
    properties:     "Up to 2 properties",
    team:           "2 team members",
    highlight:      false,
  },
  {
    key:            "GROWTH",
    name:           "Growth",
    monthly:        79,
    annualMonthly:  66,
    annual:         790,
    properties:     "Up to 10 properties",
    team:           "10 team members",
    highlight:      true,
  },
  {
    key:            "PRO",
    name:           "Pro",
    monthly:        149,
    annualMonthly:  124,
    annual:         1490,
    properties:     "Unlimited properties",
    team:           "Unlimited team members",
    highlight:      false,
  },
];

const TIER_DISPLAY: Record<string, string> = {
  TRIAL:   "Free Trial",
  STARTER: "Starter",
  GROWTH:  "Growth",
  PRO:     "Pro",
};

// ─── Billing toggle ───────────────────────────────────────────────────────────

function BillingToggle({ annual, onChange }: { annual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-1">
      <button
        onClick={() => onChange(false)}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${!annual ? "bg-header text-white" : "text-gray-500 hover:text-header"}`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${annual ? "bg-header text-white" : "text-gray-500 hover:text-header"}`}
      >
        Annual
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${annual ? "bg-gold text-header" : "bg-gold/10 text-gold-dark"}`}>
          -17%
        </span>
      </button>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  annual,
  currentTier,
  onUpgrade,
  loading,
}: {
  plan: typeof PLANS[0];
  annual: boolean;
  currentTier: string;
  onUpgrade: (key: string, billing: string) => void;
  loading: string | null;
}) {
  const isCurrent = plan.key === currentTier;
  const price     = annual ? plan.annualMonthly : plan.monthly;
  const isLoading = loading === plan.key;

  return (
    <div className={`rounded-2xl p-6 border flex flex-col ${
      plan.highlight ? "bg-header border-header" : "bg-white border-gray-100"
    }`}>
      {plan.highlight && (
        <span className="text-xs font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-3">
          Most popular
        </span>
      )}
      <h3 className={`font-display text-lg mb-1 ${plan.highlight ? "text-white" : "text-header"}`}>
        {plan.name}
      </h3>
      <div className="mb-4">
        <span className={`text-3xl font-display ${plan.highlight ? "text-white" : "text-header"}`}>
          ${price}
        </span>
        <span className={`text-xs ml-1 ${plan.highlight ? "text-white/50" : "text-gray-400"}`}>
          /mo{annual ? ", billed annually" : ""}
        </span>
      </div>
      <ul className="space-y-1.5 mb-6 flex-1">
        {[plan.properties, plan.team].map((feat) => (
          <li key={feat} className="flex items-center gap-2 text-xs font-sans">
            <svg className={`w-3.5 h-3.5 flex-shrink-0 ${plan.highlight ? "text-gold" : "text-gold"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className={plan.highlight ? "text-white/80" : "text-gray-600"}>{feat}</span>
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <div className={`text-center py-2.5 rounded-lg text-sm font-semibold ${
          plan.highlight ? "bg-white/10 text-white/60" : "bg-gray-50 text-gray-400"
        }`}>
          Current plan
        </div>
      ) : (
        <button
          onClick={() => onUpgrade(plan.key, annual ? "annual" : "monthly")}
          disabled={!!loading}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            plan.highlight
              ? "bg-gold text-header hover:bg-gold/90"
              : "bg-header text-white hover:bg-header/90"
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecting…
            </span>
          ) : (
            "Upgrade to " + plan.name
          )}
        </button>
      )}
    </div>
  );
}

// ─── Current plan summary ─────────────────────────────────────────────────────

function CurrentPlanCard({ info, onManage, managing }: {
  info: SubscriptionInfo;
  onManage: () => void;
  managing: boolean;
}) {
  const tier   = TIER_DISPLAY[info.pricingTier] ?? info.pricingTier;
  const locked = info.isLocked;

  return (
    <div className={`rounded-2xl p-6 border ${locked ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-sans mb-1">Current plan</p>
          <h2 className="font-display text-2xl text-header">{tier}</h2>

          {/* Trial info */}
          {info.pricingTier === "TRIAL" && !locked && (
            <p className="text-sm text-gray-500 font-sans mt-1">
              {info.trialDaysLeft > 0
                ? `${info.trialDaysLeft} day${info.trialDaysLeft === 1 ? "" : "s"} remaining`
                : "Trial expires today"}
            </p>
          )}
          {locked && (
            <p className="text-sm text-red-600 font-sans mt-1">
              {info.pricingTier === "TRIAL"
                ? "Your trial has expired. Data is safe — upgrade to continue."
                : "Subscription cancelled. Upgrade to restore access."}
            </p>
          )}
          {info.pricingTier !== "TRIAL" && !locked && (
            <p className="text-sm text-gray-500 font-sans mt-1 capitalize">
              {info.subscriptionStatus ?? "Active"}
            </p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400 font-sans mb-1">Properties</p>
          <p className="font-display text-xl text-header">
            {info.propertyCount}
            <span className="text-sm text-gray-400">
              {info.propertyLimit ? ` / ${info.propertyLimit}` : ""}
            </span>
          </p>
        </div>
      </div>

      {info.hasSubscription && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onManage}
            disabled={managing}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-sans hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {managing ? "Opening portal…" : "Manage subscription"}
          </button>
          <Link
            href="/pricing"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-sans hover:bg-gray-50 transition-colors"
          >
            View all features
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Inner page (needs useSearchParams) ───────────────────────────────────────

function BillingInner() {
  const searchParams = useSearchParams();
  const [info,     setInfo]     = useState<SubscriptionInfo | null>(null);
  const [loading,  setLoading]  = useState<string | null>(null); // plan key being upgraded
  const [managing, setManaging] = useState(false);
  const [annual,   setAnnual]   = useState(false);

  useEffect(() => {
    fetch("/api/stripe/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Subscription activated! Welcome to your new plan.");
    }
  }, [searchParams]);

  async function handleUpgrade(planKey: string, billing: string) {
    setLoading(planKey);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: planKey.toLowerCase(), billing }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to start checkout."); return; }
      window.location.href = data.url;
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setManaging(true);
    try {
      const res = await fetch("/api/stripe/portal");
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to open billing portal."); return; }
      window.location.href = data.url;
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setManaging(false);
    }
  }

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-header">Billing & Subscription</h1>
        <p className="text-sm text-gray-500 font-sans mt-1">
          Manage your plan, view usage, and upgrade at any time.
        </p>
      </div>

      {/* Current plan */}
      {info ? (
        <div className="max-w-2xl mb-10">
          <CurrentPlanCard info={info} onManage={handleManage} managing={managing} />
        </div>
      ) : (
        <div className="max-w-2xl mb-10 h-32 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      )}

      {/* Upgrade section — shown when not on a paid plan or locked */}
      {(!info?.hasSubscription || info?.isLocked) && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl text-header">Choose a plan</h2>
              <p className="text-sm text-gray-500 font-sans mt-0.5">No card required during your trial.</p>
            </div>
            <BillingToggle annual={annual} onChange={setAnnual} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                annual={annual}
                currentTier={info?.pricingTier ?? "TRIAL"}
                onUpgrade={handleUpgrade}
                loading={loading}
              />
            ))}
          </div>

          <p className="text-xs text-gray-400 font-sans mt-6">
            You will be redirected to Stripe&apos;s secure checkout. Cancel anytime from your billing portal.{" "}
            <Link href="/pricing" className="text-header hover:underline">
              Compare all features →
            </Link>
          </p>
        </>
      )}

      {/* Already on paid plan — show upgrade options */}
      {info?.hasSubscription && !info?.isLocked && info.pricingTier !== "PRO" && (
        <>
          <div className="flex items-center justify-between mb-6 mt-2">
            <div>
              <h2 className="font-display text-xl text-header">Upgrade your plan</h2>
              <p className="text-sm text-gray-500 font-sans mt-0.5">Changes take effect immediately.</p>
            </div>
            <BillingToggle annual={annual} onChange={setAnnual} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                annual={annual}
                currentTier={info.pricingTier}
                onUpgrade={handleUpgrade}
                loading={loading}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  return (
    <Suspense>
      <BillingInner />
    </Suspense>
  );
}
