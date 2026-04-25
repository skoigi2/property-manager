"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface SubscriptionInfo {
  pricingTier:   string;
  trialDaysLeft: number;
  isLocked:      boolean;
  hasSubscription: boolean;
}

export function TrialBanner() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isBillingOwner = (session?.user as any)?.isBillingOwner ?? false;
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  // Don't render on the billing page itself
  const isBillingPage = pathname === "/billing";

  useEffect(() => {
    fetch("/api/stripe/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => {});
  }, [pathname]);

  if (!info)              return null;
  if (isBillingPage)      return null;
  if (info.hasSubscription && !info.isLocked) return null; // active paid plan, no banner needed

  // ── Locked (expired trial or canceled subscription) ────────────────────────
  if (info.isLocked) {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-sans">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {info.pricingTier === "TRIAL"
              ? "Your free trial has expired. Your data is safe —"
              : "Your subscription has been cancelled —"}
            {isBillingOwner ? " upgrade to continue." : " contact your billing owner to restore access."}
          </span>
        </div>
        {isBillingOwner && (
          <Link
            href="/billing"
            className="flex-shrink-0 bg-white text-red-600 font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-red-50 transition-colors"
          >
            Upgrade now
          </Link>
        )}
      </div>
    );
  }

  // ── Active trial ───────────────────────────────────────────────────────────
  if (info.pricingTier === "TRIAL") {
    const urgent = info.trialDaysLeft <= 7;
    return (
      <div className={`${urgent ? "bg-amber-500" : "bg-header/95"} text-white px-4 py-2 flex items-center justify-between gap-4 text-sm font-sans`}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {info.trialDaysLeft === 0
              ? "Your trial expires today."
              : `${info.trialDaysLeft} day${info.trialDaysLeft === 1 ? "" : "s"} left in your free trial.`}
            {" "}
            {isBillingOwner
              ? "No card required to keep exploring."
              : "Contact your billing owner to upgrade."}
          </span>
        </div>
        {isBillingOwner && (
          <Link
            href="/billing"
            className="flex-shrink-0 bg-gold text-header font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-gold/90 transition-colors"
          >
            View plans
          </Link>
        )}
      </div>
    );
  }

  return null;
}
