import { describe, it, expect } from "vitest";
import {
  isTrialExpired,
  isSubscriptionActive,
  isLocked,
  trialDaysLeft,
} from "@/lib/subscription";

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

describe("isTrialExpired", () => {
  it("is false for non-trial tiers regardless of date", () => {
    expect(isTrialExpired({ pricingTier: "PRO", trialEndsAt: daysFromNow(-100) })).toBe(false);
  });

  it("treats a trial with no end date as expired", () => {
    expect(isTrialExpired({ pricingTier: "TRIAL", trialEndsAt: null })).toBe(true);
  });

  it("compares against now", () => {
    expect(isTrialExpired({ pricingTier: "TRIAL", trialEndsAt: daysFromNow(1) })).toBe(false);
    expect(isTrialExpired({ pricingTier: "TRIAL", trialEndsAt: daysFromNow(-1) })).toBe(true);
  });
});

describe("isSubscriptionActive / isLocked", () => {
  it("freeAccess orgs are always active and never locked", () => {
    const org = {
      pricingTier: "TRIAL",
      subscriptionStatus: null,
      trialEndsAt: daysFromNow(-30),
      freeAccess: true,
    };
    expect(isSubscriptionActive(org)).toBe(true);
    expect(isLocked(org)).toBe(false);
  });

  it("paid tiers are active only with active/trialing status", () => {
    const base = { pricingTier: "GROWTH", trialEndsAt: null };
    expect(isSubscriptionActive({ ...base, subscriptionStatus: "active" })).toBe(true);
    expect(isSubscriptionActive({ ...base, subscriptionStatus: "trialing" })).toBe(true);
    expect(isSubscriptionActive({ ...base, subscriptionStatus: "canceled" })).toBe(false);
  });

  it("locks paid tiers on canceled / expired / past_due", () => {
    const base = { pricingTier: "STARTER", trialEndsAt: null };
    for (const status of ["canceled", "expired", "past_due"]) {
      expect(isLocked({ ...base, subscriptionStatus: status })).toBe(true);
    }
    expect(isLocked({ ...base, subscriptionStatus: "active" })).toBe(false);
  });

  it("locks trials only when expired", () => {
    const base = { pricingTier: "TRIAL", subscriptionStatus: null };
    expect(isLocked({ ...base, trialEndsAt: daysFromNow(5) })).toBe(false);
    expect(isLocked({ ...base, trialEndsAt: daysFromNow(-5) })).toBe(true);
  });
});

describe("trialDaysLeft", () => {
  it("rounds up partial days and floors at 0", () => {
    expect(trialDaysLeft(daysFromNow(2.5))).toBe(3);
    expect(trialDaysLeft(daysFromNow(-2))).toBe(0);
    expect(trialDaysLeft(null)).toBe(0);
  });
});
