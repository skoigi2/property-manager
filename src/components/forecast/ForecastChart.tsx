"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/currency";
import { CHART_FONT } from "@/lib/chart-style";
import type { ForecastMonth } from "@/types/forecast";

interface Props {
  months: ForecastMonth[];
  currency?: string;
}

export function ForecastChart({ months, currency = "USD" }: Props) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={months}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          barSize={18}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#F3F4F6"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={CHART_FONT.axisTick}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={CHART_FONT.numericAxisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              ...CHART_FONT.tooltip,
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value, name) => [
              typeof value === "number" ? formatCurrency(value, currency) : String(value ?? ""),
              name === "forecastedRent"
                ? "Forecasted Income"
                : name === "projectedExpenses"
                ? "Projected Expenses"
                : "Net Cashflow",
            ]}
          />
          <Legend
            wrapperStyle={CHART_FONT.legend}
            formatter={(v) =>
              v === "forecastedRent"
                ? "Forecasted Income"
                : v === "projectedExpenses"
                ? "Projected Expenses"
                : "Net Cashflow"
            }
          />
          <Bar dataKey="forecastedRent" fill="#E8C97A" radius={[3, 3, 0, 0]} />
          <Bar dataKey="projectedExpenses" fill="#EF4444" radius={[3, 3, 0, 0]} />
          <Bar dataKey="netCashflow" fill="#22c55e" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
