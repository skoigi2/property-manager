import { describe, it, expect } from "vitest";
import {
  nextRentReview,
  reviewDateAfter,
  firstReviewDate,
  proposedRentFor,
  hasEscalationTerms,
  ceilToMonthStart,
  type EscalationTerms,
} from "../rent-escalation";

const d = (s: string) => new Date(`${s}T00:00:00`);
const ymd = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

const terms = (over: Partial<EscalationTerms> = {}): EscalationTerms => ({
  leaseStart: d("2025-01-01"),
  leaseEnd: null,
  escalationType: "PERCENT",
  escalationRate: 5,
  escalationAmount: null,
  escalationIntervalYears: 1,
  escalationAnchorDate: null,
  ...over,
});

describe("review schedule", () => {
  it("first review is lease start + interval unless an anchor is set", () => {
    expect(ymd(firstReviewDate(terms()))).toBe("2026-01-01");
    expect(ymd(firstReviewDate(terms({ escalationIntervalYears: 2 })))).toBe("2027-01-01");
    expect(ymd(firstReviewDate(terms({ escalationAnchorDate: d("2025-07-01") })))).toBe("2025-07-01");
  });

  it("steps by the interval and is strictly after the given date", () => {
    const t = terms({ escalationIntervalYears: 2 });
    expect(ymd(reviewDateAfter(t, d("2027-01-01")))).toBe("2029-01-01");
    expect(ymd(reviewDateAfter(t, d("2026-12-31")))).toBe("2027-01-01");
  });

  it("29 Feb anchors fall back to 28 Feb", () => {
    const t = terms({ escalationAnchorDate: d("2028-02-29") });
    expect(ymd(reviewDateAfter(t, d("2028-03-01")))).toBe("2029-02-28");
  });
});

describe("proposed rent", () => {
  it("percent rounds to a whole unit; fixed adds the amount", () => {
    expect(proposedRentFor(terms({ escalationRate: 7.5 }), 45_000)).toBe(48_375);
    expect(proposedRentFor(terms({ escalationRate: 5 }), 33_333)).toBe(35_000);
    expect(proposedRentFor(terms({ escalationType: "FIXED_AMOUNT", escalationAmount: 2_000 }), 40_000)).toBe(42_000);
  });

  it("no terms when the rate or amount is 0 / missing", () => {
    expect(hasEscalationTerms(terms({ escalationRate: 0 }))).toBe(false);
    expect(hasEscalationTerms(terms({ escalationType: "FIXED_AMOUNT", escalationAmount: null }))).toBe(false);
    expect(nextRentReview(terms({ escalationRate: null }), [], 40_000, 90, d("2025-11-01"))).toBeNull();
  });
});

describe("nextRentReview", () => {
  it("is quiet until 30 days before the notice deadline, then upcoming", () => {
    // Review 2026-01-01, 90 days notice → deadline 2025-10-03.
    expect(nextRentReview(terms(), [], 40_000, 90, d("2025-08-01"))!.state).toBe("none");
    const r = nextRentReview(terms(), [], 40_000, 90, d("2025-09-10"))!;
    expect(r.state).toBe("upcoming");
    expect(ymd(r.reviewDate)).toBe("2026-01-01");
    expect(ymd(r.noticeDeadline)).toBe("2025-10-03");
    expect(r.proposedRent).toBe(42_000);
    expect(ymd(r.proposedEffectiveDate)).toBe("2026-01-01");
  });

  it("past the notice deadline: the increase moves to the first month after full notice", () => {
    const r = nextRentReview(terms(), [], 40_000, 90, d("2025-11-15"))!;
    expect(r.state).toBe("notice_late");
    // 15 Nov + 90 days = 13 Feb → 1 Mar.
    expect(ymd(r.proposedEffectiveDate)).toBe("2026-03-01");
  });

  it("a review that passed with no change is overdue for 90 days", () => {
    const r = nextRentReview(terms(), [], 40_000, 60, d("2026-02-10"))!;
    expect(r.state).toBe("overdue");
    expect(ymd(r.reviewDate)).toBe("2026-01-01");
    expect(r.missedReviews).toBe(0);
    // 10 Feb + 60 days = 11 Apr → 1 May.
    expect(ymd(r.proposedEffectiveDate)).toBe("2026-05-01");
  });

  it("the latest past review is the overdue one; older ones only count as missed", () => {
    const r = nextRentReview(terms(), [], 40_000, 60, d("2027-02-15"))!;
    expect(r.state).toBe("overdue");
    expect(ymd(r.reviewDate)).toBe("2027-01-01");
    expect(r.missedReviews).toBe(1); // 2026-01-01
  });

  it("past the grace window the schedule moves on to the next review", () => {
    const r = nextRentReview(terms(), [], 40_000, 90, d("2027-06-10"))!;
    expect(ymd(r.reviewDate)).toBe("2028-01-01");
    expect(r.state).toBe("none");
    expect(r.missedReviews).toBe(2); // 2026-01-01 and 2027-01-01
    expect(r.proposedRent).toBe(42_000); // one step from today's rent
  });

  it("a recorded increase (or a skipped review) moves the schedule on", () => {
    const history = [
      { monthlyRent: 40_000, effectiveDate: d("2025-01-01") },
      { monthlyRent: 42_000, effectiveDate: d("2026-01-01") },
    ];
    const r = nextRentReview(terms(), history, 42_000, 90, d("2026-02-01"))!;
    expect(ymd(r.reviewDate)).toBe("2027-01-01");
    expect(r.state).toBe("none");
    expect(r.proposedRent).toBe(44_100);
  });

  it("a scheduled increase covers its review and is the base for the next one", () => {
    const history = [{ monthlyRent: 42_000, effectiveDate: d("2026-01-01"), appliedAt: null }];
    const r = nextRentReview(terms(), history, 40_000, 90, d("2025-11-01"))!;
    expect(ymd(r.reviewDate)).toBe("2027-01-01");
    expect(r.baseRent).toBe(42_000);
  });

  it("skips a lease that ends before the review (the renewal handles it)", () => {
    expect(nextRentReview(terms({ leaseEnd: d("2025-12-31") }), [], 40_000, 90, d("2025-10-01"))).toBeNull();
    expect(nextRentReview(terms({ leaseEnd: d("2026-06-30") }), [], 40_000, 90, d("2025-10-01"))).not.toBeNull();
  });
});

describe("ceilToMonthStart", () => {
  it("keeps the 1st, rounds anything else up", () => {
    expect(ymd(ceilToMonthStart(d("2026-03-01")))).toBe("2026-03-01");
    expect(ymd(ceilToMonthStart(d("2026-12-02")))).toBe("2027-01-01");
  });
});
