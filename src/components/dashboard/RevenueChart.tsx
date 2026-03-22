"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatKSh } from "@/lib/currency";

interface TrendPoint {
  label: string;
  gross: number;
  net: number;
}

export function RevenueChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "var(--font-sans)", fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} width={48} />
          <Tooltip
            contentStyle={{ fontFamily: "var(--font-sans)", fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
            formatter={(value, name) => [typeof value === "number" ? formatKSh(value) : String(value ?? ""), String(name) === "gross" ? "Gross" : "Net"]}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-sans)" }} formatter={(v) => v === "gross" ? "Gross Income" : "Net Profit"} />
          <Bar dataKey="gross" fill="#E8C97A" radius={[3, 3, 0, 0]} />
          <Bar dataKey="net" fill="#C9A84C" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
