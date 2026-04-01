/** Supported currencies with their display symbols/prefixes */
export const SUPPORTED_CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "KES", label: "Kenyan Shilling (KSh)",   symbol: "KSh" },
  { code: "USD", label: "US Dollar ($)",             symbol: "$"   },
  { code: "GBP", label: "British Pound (£)",         symbol: "£"   },
  { code: "EUR", label: "Euro (€)",                  symbol: "€"   },
  { code: "TZS", label: "Tanzanian Shilling (TSh)",  symbol: "TSh" },
  { code: "UGX", label: "Ugandan Shilling (USh)",    symbol: "USh" },
  { code: "ZAR", label: "South African Rand (R)",    symbol: "R"   },
  { code: "AED", label: "UAE Dirham (AED)",           symbol: "AED" },
  { code: "INR", label: "Indian Rupee (₹)",          symbol: "₹"   },
  { code: "CHF", label: "Swiss Franc (CHF)",          symbol: "CHF" },
];

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c.symbol])
);

/**
 * Format a number as {symbol} X,XXX for any supported currency.
 * Defaults to KES if no currency is provided.
 */
export function formatCurrency(
  amount: number,
  currency = "KES",
  options?: { compact?: boolean; showSign?: boolean }
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;

  if (options?.compact) {
    if (Math.abs(amount) >= 1_000_000) {
      return `${symbol} ${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(amount) >= 1_000) {
      return `${symbol} ${(Math.abs(amount) / 1_000).toFixed(0)}K`;
    }
  }

  const formatted = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));

  const sign = options?.showSign && amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${symbol} ${formatted}`;
}

/**
 * Format a number as KSh X,XXX (Kenyan Shillings).
 * Kept for backward compatibility — prefer formatCurrency(amount, currency).
 */
export function formatKSh(amount: number, options?: { compact?: boolean; showSign?: boolean }): string {
  return formatCurrency(amount, "KES", options);
}

/** Parse a currency string back to a number */
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
