"use client";
import { clsx } from "clsx";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";

interface KPICardProps {
  label: string;
  amount: number;
  type?: "income" | "expense" | "neutral" | "balance";
  icon?: React.ReactNode;
  subtext?: string;
  currency?: string;
}

export function KPICard({ label, amount, type = "neutral", icon, subtext, currency = "KES" }: KPICardProps) {
  const colors = {
    income: "border-income/30 bg-green-50",
    expense: "border-expense/30 bg-red-50",
    neutral: "border-gold/30 bg-yellow-50",
    balance: amount >= 0 ? "border-income/30 bg-green-50" : "border-expense/30 bg-red-50",
  };
  const textColors = {
    income: "text-income",
    expense: "text-expense",
    neutral: "text-gold-dark",
    balance: amount >= 0 ? "text-income" : "text-expense",
  };

  return (
    <div className={clsx("rounded-xl border-2 p-4 bg-white shadow-card", colors[type])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 font-sans uppercase tracking-wide leading-tight">{label}</p>
        {icon && <span className="text-gray-300 shrink-0">{icon}</span>}
      </div>
      <CurrencyDisplay currency={currency} amount={amount} className={clsx("block mt-2", textColors[type])} size="xl" />
      {subtext && <p className="text-xs text-gray-400 font-sans mt-1">{subtext}</p>}
    </div>
  );
}
