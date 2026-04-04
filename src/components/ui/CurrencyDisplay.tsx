import { clsx } from "clsx";
import { formatCurrency } from "@/lib/currency";

interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  className?: string;
  colorize?: boolean;
  compact?: boolean;
  showSign?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export function CurrencyDisplay({
  amount,
  currency = "USD",
  className,
  colorize = false,
  compact = false,
  showSign = false,
  size = "md",
}: CurrencyDisplayProps) {
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
      {formatCurrency(amount, currency, { compact, showSign })}
    </span>
  );
}
