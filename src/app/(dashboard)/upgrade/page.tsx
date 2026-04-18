"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";

const PLANS: Array<{
  key: PlanKey;
  name: string;
  monthly: number;
  annualMonthly: number;
  annual: number;
  highlight: boolean;
  features: string[];
}> = [
  { key: "starter", name: "Starter", monthly: 29,  annualMonthly: 24,  annual: 290,  highlight: false, features: ["Up to 2 properties", "Core financials", "Tenant management", "Email support"] },
  { key: "growth",  name: "Growth",  monthly: 79,  annualMonthly: 66,  annual: 790,  highlight: true,  features: ["Up to 10 properties", "Everything in Starter", "Forecasting & compliance", "Owner reports", "Priority support"] },
  { key: "pro",     name: "Pro",     monthly: 149, annualMonthly: 124, annual: 1490, highlight: false, features: ["Unlimited properties", "Everything in Growth", "Multi-org / white-label", "Dedicated support"] },
];

type PlanKey = "starter" | "growth" | "pro";
type Billing = "monthly" | "annual";

// Price IDs are injected at build time — safe to expose client-side.
const PRICE_IDS: Record<PlanKey, Record<Billing, string>> = {
  starter: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL  ?? "",
  },
  growth: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_ANNUAL  ?? "",
  },
  pro: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY ?? "",
    annual:  process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_ANNUAL  ?? "",
  },
};

export default function UpgradePage() {
  const { data: session } = useSession();
  const [annual, setAnnual]   = useState(false);
  const [paddle, setPaddle]   = useState<Paddle | undefined>();
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    initializePaddle({
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "production") as "sandbox" | "production",
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
    }).then(setPaddle);
  }, []);

  function openCheckout(planKey: PlanKey) {
    if (!paddle || !session?.user) return;
    const priceId = PRICE_IDS[planKey][annual ? "annual" : "monthly"];
    if (!priceId) {
      console.error(`[upgrade] no price ID configured for ${planKey} ${annual ? "annual" : "monthly"}`);
      return;
    }

    setLoading(planKey);
    const email = session.user.email;

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      ...(email ? { customer: { email } } : {}),
      customData: {
        organizationId: (session.user as any).organizationId ?? "",
      },
      settings: {
        successUrl: `${window.location.origin}/billing?upgraded=1`,
        displayMode: "overlay",
      },
    });

    // Reset loading after a short delay — Paddle opens an overlay
    setTimeout(() => setLoading(null), 1500);
  }

  return (
    <div className="page-container max-w-4xl">
      <div className="text-center mb-10">
        <h1 className="font-display text-3xl text-header mb-2">Choose your plan</h1>
        <p className="text-sm text-gray-500 font-sans">
          Your free trial has ended. Select a plan to continue using Groundwork PM.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-1 mt-6">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = annual ? plan.annualMonthly : plan.monthly;
          const isLoading = loading === plan.key;

          return (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 border flex flex-col ${
                plan.highlight
                  ? "bg-header border-header shadow-xl"
                  : "bg-white border-gray-100 shadow-sm"
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-semibold bg-gold text-header px-3 py-1 rounded-full self-start mb-3">
                  Most popular
                </span>
              )}

              <h2 className={`font-display text-xl mb-4 ${plan.highlight ? "text-white" : "text-header"}`}>
                {plan.name}
              </h2>

              <div className="mb-6">
                <span className={`text-4xl font-display ${plan.highlight ? "text-white" : "text-header"}`}>
                  ${price}
                </span>
                <span className={`text-xs ml-1 ${plan.highlight ? "text-white/50" : "text-gray-400"}`}>
                  {annual ? "/mo, billed annually" : "/mo"}
                </span>
                {annual && (
                  <p className={`text-xs mt-1 ${plan.highlight ? "text-white/40" : "text-gray-300"}`}>
                    ${plan.annual}/year
                  </p>
                )}
              </div>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-2 ${plan.highlight ? "text-white/80" : "text-gray-500"}`}>
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => openCheckout(plan.key)}
                disabled={!paddle || isLoading}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  plan.highlight
                    ? "bg-gold text-header hover:bg-gold/90"
                    : "bg-header text-white hover:bg-header/90"
                }`}
              >
                {isLoading ? "Opening checkout…" : `Subscribe to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-400 mt-8 font-sans">
        Payments are processed securely by Paddle · Cancel anytime ·{" "}
        <a href="/refund" className="hover:text-header underline">Refund policy</a>
      </p>
    </div>
  );
}
