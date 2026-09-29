// Rent escalation rules (pure — no Prisma). A lease's increase terms become a
// series of review dates: the first review (Tenant.escalationAnchorDate, else
// lease start + one interval), then every `interval` years. The next review
// that matters is the first one AFTER the tenant's latest rent change
// (applied or scheduled), so recording an increase — or skipping a review —
// moves the schedule on, and a review nobody acted on shows as overdue.
//
// An increase can never be backdated: when the review date has passed, or the
// notice deadline before it has, the proposal moves the effective date to the
// first of the month after the notice period runs out.
//
// A missed review stays "overdue" for OVERDUE_GRACE_DAYS. After that the
// schedule moves on to the next review and the old one only counts in
// `missedReviews` — otherwise every lease imported with terms but no recorded
// history would nag about reviews years ago whose money can't be recovered
// (and that were often done, just never recorded).

export const OVERDUE_GRACE_DAYS = 90;

export type EscalationTypeValue = "PERCENT" | "FIXED_AMOUNT";

export interface EscalationTerms {
  leaseStart: Date | string;
  leaseEnd: Date | string | null;
  escalationType: EscalationTypeValue;
  escalationRate: number | null;
  escalationAmount: number | null;
  escalationIntervalYears: number | null;
  escalationAnchorDate: Date | string | null;
}

export interface RentChangePoint {
  monthlyRent: number;
  effectiveDate: Date | string;
  /** null = scheduled, not yet applied. Undefined is treated as applied. */
  appliedAt?: Date | string | null;
}

export type ReviewState =
  /** More than 30 days before the notice deadline — nothing to do yet. */
  | "none"
  /** Within 30 days of the notice deadline — time to send the notice. */
  | "upcoming"
  /** The notice deadline has passed; the increase can't start on the review date. */
  | "notice_late"
  /** The review date itself has passed with no increase recorded. */
  | "overdue";

export interface RentReview {
  reviewDate: Date;
  noticeDeadline: Date;
  state: ReviewState;
  /** Rent the increase is calculated from. */
  baseRent: number;
  proposedRent: number;
  /** Review date, or the first of the month after full notice when late. */
  proposedEffectiveDate: Date;
  /** Earlier reviews since the last change with no increase recorded (not counting `reviewDate`). */
  missedReviews: number;
}

const DAY = 86_400_000;

function toDate(d: Date | string): Date {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
  // 29 Feb → 28 Feb in a non-leap year instead of rolling into March.
  if (x.getMonth() !== d.getMonth()) return new Date(d.getFullYear() + years, d.getMonth() + 1, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** The first of the month on or after `d`. */
export function ceilToMonthStart(d: Date): Date {
  return d.getDate() === 1 ? toDate(d) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function hasEscalationTerms(t: EscalationTerms): boolean {
  return t.escalationType === "FIXED_AMOUNT"
    ? (t.escalationAmount ?? 0) > 0
    : (t.escalationRate ?? 0) > 0;
}

export function escalationInterval(t: EscalationTerms): number {
  return Math.max(1, t.escalationIntervalYears ?? 1);
}

export function firstReviewDate(t: EscalationTerms): Date {
  return t.escalationAnchorDate ? toDate(t.escalationAnchorDate) : addYears(toDate(t.leaseStart), escalationInterval(t));
}

/** The first review date strictly after `after`. */
export function reviewDateAfter(t: EscalationTerms, after: Date): Date {
  const interval = escalationInterval(t);
  const first = firstReviewDate(t);
  let d = first;
  for (let k = 1; d.getTime() <= after.getTime() && k < 200; k++) d = addYears(first, k * interval);
  return d;
}

export function proposedRentFor(t: EscalationTerms, base: number): number {
  if (t.escalationType === "FIXED_AMOUNT") return Math.round((base + (t.escalationAmount ?? 0)) * 100) / 100;
  return Math.round(base * (1 + (t.escalationRate ?? 0) / 100));
}

/** Human description, e.g. "5% every year" / "KSh 2,000 every 2 years". */
export function describeEscalation(t: EscalationTerms, fmtMoney: (n: number) => string): string {
  const n = escalationInterval(t);
  const every = n === 1 ? "every year" : `every ${n} years`;
  return t.escalationType === "FIXED_AMOUNT"
    ? `${fmtMoney(t.escalationAmount ?? 0)} ${every}`
    : `${t.escalationRate ?? 0}% ${every}`;
}

/**
 * The tenant's next rent review, or null when there is nothing to review:
 * no terms, or the lease ends before the review (the renewal handles it).
 */
export function nextRentReview(
  t: EscalationTerms,
  history: RentChangePoint[],
  currentRent: number,
  noticeDays: number,
  today: Date = new Date(),
): RentReview | null {
  if (!hasEscalationTerms(t)) return null;
  const day = toDate(today);

  const sorted = [...history].sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());
  const latest = sorted[sorted.length - 1];
  const lastChange = latest ? toDate(latest.effectiveDate) : toDate(t.leaseStart);
  const after = lastChange.getTime() > toDate(t.leaseStart).getTime() ? lastChange : toDate(t.leaseStart);

  // Walk the reviews since the last change that are already past: the latest
  // is overdue while within the grace window; anything older is just missed.
  let reviewDate = reviewDateAfter(t, after);
  let missedReviews = 0;
  if (reviewDate.getTime() <= day.getTime()) {
    let latestPast = reviewDate;
    for (let next = reviewDateAfter(t, latestPast); next.getTime() <= day.getTime() && missedReviews < 200; next = reviewDateAfter(t, next)) {
      latestPast = next;
      missedReviews++;
    }
    if (day.getTime() - latestPast.getTime() <= OVERDUE_GRACE_DAYS * DAY) {
      reviewDate = latestPast;
    } else {
      reviewDate = reviewDateAfter(t, latestPast);
      missedReviews++;
    }
  }
  if (t.leaseEnd && toDate(t.leaseEnd).getTime() < reviewDate.getTime()) return null;

  // A scheduled (unapplied) change is the rent the next increase builds on.
  const baseRent = latest && latest.appliedAt === null ? latest.monthlyRent : currentRent;
  const noticeDeadline = addDays(reviewDate, -noticeDays);

  let state: ReviewState = "none";
  if (reviewDate.getTime() <= day.getTime()) state = "overdue";
  else if (noticeDeadline.getTime() < day.getTime()) state = "notice_late";
  else if (noticeDeadline.getTime() - day.getTime() <= 30 * DAY) state = "upcoming";

  const proposedEffectiveDate =
    state === "overdue" || state === "notice_late"
      ? (() => {
          const earliest = ceilToMonthStart(addDays(day, noticeDays));
          return earliest.getTime() > reviewDate.getTime() ? earliest : reviewDate;
        })()
      : reviewDate;

  return {
    reviewDate,
    noticeDeadline,
    state,
    baseRent,
    proposedRent: proposedRentFor(t, baseRent),
    proposedEffectiveDate,
    missedReviews,
  };
}

/** Whole days of notice a tenant gets if told today for `effective`. */
export function noticeGivenDays(effective: Date, today: Date = new Date()): number {
  return Math.round((toDate(effective).getTime() - toDate(today).getTime()) / DAY);
}
