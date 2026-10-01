/**
 * Sample-data freshness (client-safe, pure). A demo seed writes data up to
 * the month it was loaded in, with dates relative to that day — so once that
 * calendar month has passed, the months since read as unpaid rent, unread
 * meters and lapsed leases. Such a demo is "stale" and offered a refresh.
 */

export function isSampleStale(seededAt: Date | string, now: Date = new Date()): boolean {
  const s = new Date(seededAt);
  return s.getFullYear() * 12 + s.getMonth() < now.getFullYear() * 12 + now.getMonth();
}

/** Grace after the seed before a row counts as the user's own (the seed itself runs for up to a few minutes). */
export const SEED_GRACE_MS = 10 * 60 * 1000;

export interface AddedSinceSeed {
  tenants: number;
  payments: number;
  expenses: number;
  maintenanceJobs: number;
}

/** "1 tenant, 3 payments and 2 expenses", or null when nothing was added. */
export function describeAddedSinceSeed(added: AddedSinceSeed): string | null {
  const parts = (
    [
      [added.tenants, "tenant"],
      [added.payments, "payment"],
      [added.expenses, "expense"],
      [added.maintenanceJobs, "maintenance job"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** localStorage key for "not now" — per property and calendar month, so it comes back next month. */
export function refreshDismissKey(propertyId: string, now: Date = new Date()): string {
  return `sample-refresh-dismissed:${propertyId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
