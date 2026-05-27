"use client";

import { clsx } from "clsx";
import { formatCurrency } from "@/lib/currency";
import { useProperty } from "@/lib/property-context";

interface CurrencyDisplayProps {
  amount: number;
  /**
   * Override currency. When omitted, falls back to `useProperty().currency` — i.e.
   * the selected property's currency (or the shared currency across all properties).
   * Pass this explicitly on pages where the underlying record belongs to a
   * different property than the header selector (e.g. tenant detail reached
   * via deep-link from another property).
   */
  currency?: string;
  className?: string;
  colorize?: boolean;
  compact?: boolean;
  showSign?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export function CurrencyDisplay({
  amount,
  currency,
  className,
  colorize = false,
  compact = false,
  showSign = false,
  size = "md",
}: CurrencyDisplayProps) {
  // Context fallback so callers don't have to thread `currency` through every
  // <CurrencyDisplay> call — the global default was previously hard-coded to USD,
  // which produced `$` on every page that forgot the prop.
  const contextCurrency = useProperty().currency;
  const resolved = currency ?? contextCurrency;

  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-2xl",
  };

  return (
    <span
      className={clsx(
        "font-mono tabular-nums",
        sizes[size],
        colorize && amount > 0 && "text-income",
        colorize && amount < 0 && "text-expense",
        colorize && amount === 0 && "text-gray-500",
        className
      )}
    >
      {formatCurrency(amount, resolved, { compact, showSign })}
    </span>
  );
}
