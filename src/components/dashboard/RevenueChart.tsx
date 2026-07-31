"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency } from "@/lib/currency";
import { CHART_FONT } from "@/lib/chart-style";

interface TrendPoint {
  label: string;
  gross: number;
  net: number;
}

export function RevenueChart({ data, currency = "USD" }: { data: TrendPoint[]; currency?: string }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="label" tick={CHART_FONT.axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={CHART_FONT.numericAxisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} width={48} />
          <Tooltip
            contentStyle={{ ...CHART_FONT.tooltip, borderRadius: 8, border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
            formatter={(value, name) => [typeof value === "number" ? formatCurrency(value, currency) : String(value ?? ""), String(name) === "gross" ? "Gross" : "Net"]}
          />
          <Legend wrapperStyle={CHART_FONT.legend} formatter={(v) => v === "gross" ? "Gross Income" : "Net Profit"} />
          <Bar dataKey="gross" fill="#E8C97A" radius={[3, 3, 0, 0]} />
          <Bar dataKey="net" fill="#C9A84C" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
