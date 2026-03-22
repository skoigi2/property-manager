/**
 * Format a number as KSh X,XXX
 * Always uses Kenyan Shillings, never bare numbers.
 */
export function formatKSh(amount: number, options?: { compact?: boolean; showSign?: boolean }): string {
  if (options?.compact) {
    if (Math.abs(amount) >= 1_000_000) {
      return `KSh ${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `KSh ${(amount / 1_000).toFixed(0)}K`;
    }
  }

  const formatted = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));

  const sign = options?.showSign && amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}KSh ${formatted}`;
}

/** Parse a KSh string back to a number */
export function parseKSh(value: string): number {
  return parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;
}

/** Format number with comma separators (no currency symbol) */
export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
