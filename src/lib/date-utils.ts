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
