import { differenceInDays, format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

export type LeaseStatus = "OK" | "WARNING" | "CRITICAL" | "TBC";

export function getLeaseStatus(leaseEnd: Date | null | undefined): LeaseStatus {
  if (!leaseEnd) return "TBC";
  const daysLeft = differenceInDays(leaseEnd, new Date());
  if (daysLeft < 0) return "CRITICAL";
  if (daysLeft <= 60) return "WARNING";
  return "OK";
}

export function daysUntilExpiry(leaseEnd: Date | null | undefined): number | null {
  if (!leaseEnd) return null;
  return differenceInDays(leaseEnd, new Date());
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "d MMM yyyy");
}

export function formatMonth(date: Date | string): string {
  return format(new Date(date), "MMMM yyyy");
}

export function getMonthRange(year: number, month: number): { from: Date; to: Date } {
  const d = new Date(year, month - 1, 1);
  return {
    from: startOfMonth(d),
    to: endOfMonth(d),
  };
}

export function isInMonth(date: Date, year: number, month: number): boolean {
  const { from, to } = getMonthRange(year, month);
  return isWithinInterval(new Date(date), { start: from, end: to });
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ─── Lease-year windows (tenant statements) ──────────────────────────────────

export interface LeaseYearRange {
  start: Date;
  end: Date;
  /** 1-based: the window starting on leaseStart itself is Lease Year 1. */
  yearNumber: number;
}

/**
 * Anniversary of leaseStart, n years on, in UTC. A Feb 29 anniversary clamps
 * to Feb 28 in non-leap years (never rolls into March).
 */
function leaseAnniversary(leaseStart: Date, n: number): Date {
  const y = leaseStart.getUTCFullYear() + n;
  const m = leaseStart.getUTCMonth();
  const d = leaseStart.getUTCDate();
  const candidate = new Date(Date.UTC(y, m, d));
  if (candidate.getUTCMonth() !== m) return new Date(Date.UTC(y, m + 1, 0));
  return candidate;
}

/**
 * The lease-anniversary year containing `asOf`, anchored on leaseStart.
 * Renewals never re-anchor (they overwrite leaseEnd, not leaseStart), so
 * year numbering stays continuous across renewals. The window end is capped
 * at min(asOf, leaseEnd, vacatedDate) — a vacated or expired tenant gets
 * their FINAL lease-year window, not an empty one.
 *
 * Returns null when leaseStart is in the future (no statement period yet).
 */
export function getLeaseYearRange(
  leaseStart: Date,
  asOf: Date,
  leaseEnd?: Date | null,
  vacatedDate?: Date | null,
): LeaseYearRange | null {
  if (asOf < leaseStart) return null;

  let effectiveEnd = asOf;
  if (leaseEnd && leaseEnd < effectiveEnd) effectiveEnd = leaseEnd;
  if (vacatedDate && vacatedDate < effectiveEnd) effectiveEnd = vacatedDate;
  if (effectiveEnd < leaseStart) effectiveEnd = leaseStart;

  let n = effectiveEnd.getUTCFullYear() - leaseStart.getUTCFullYear();
  if (leaseAnniversary(leaseStart, n) > effectiveEnd) n--;
  if (n < 0) n = 0;

  return { start: leaseAnniversary(leaseStart, n), end: effectiveEnd, yearNumber: n + 1 };
}

export function getPreviousMonths(count: number): { year: number; month: number; label: string }[] {
  const result = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: format(d, "MMM yyyy"),
    });
  }
  return result;
}
