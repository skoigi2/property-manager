"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { PhotoStrip } from "@/components/utilities/PhotoStrip";

interface Figures { billed: number; paid: number; unpaid: number }
interface Reading {
  id: string;
  utility: "WATER" | "ELECTRICITY";
  description: string;
  amount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentStatus: "PAID" | "PART_PAID" | "UNPAID" | "NOT_INVOICED";
  photoUrls: string[];
}
interface UtilitiesResponse {
  currency: string;
  water: Figures;
  electricity: Figures;
  totalUnpaid: number;
  notYetInvoiced: number;
  readings: Reading[];
}

export const UTILITY_PAYMENT_BADGE: Record<Reading["paymentStatus"], { label: string; variant: "green" | "amber" | "red" | "gray" }> = {
  PAID: { label: "Paid", variant: "green" },
  PART_PAID: { label: "Part paid", variant: "amber" },
  UNPAID: { label: "Unpaid", variant: "red" },
  NOT_INVOICED: { label: "Not invoiced yet", variant: "gray" },
};

/** Manager-side view of a tenant's metered water & electricity. */
export function TenantUtilitiesTab({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<UtilitiesResponse | null | "error">(null);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/utilities`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData("error"));
  }, [tenantId]);

  if (data === null) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (data === "error") return <p className="text-body text-gray-500 py-6 text-center">Could not load the meter readings.</p>;

  if (data.readings.length === 0) {
    return (
      <div className="py-10 text-center">
        <Gauge size={26} className="mx-auto text-gray-300 mb-2" />
        <p className="text-body text-gray-500">No approved meter readings for this tenant yet.</p>
        <Link href="/utilities" className="text-body text-gold-dark hover:underline">Go to Utilities</Link>
      </div>
    );
  }

  const fmt = (n: number) => formatCurrency(n, data.currency);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-body">
          {(["water", "electricity"] as const).map((k) => (
            <p key={k} className="text-gray-600">
              <span className="capitalize">{k}</span>: billed <span className="tabular-nums text-gray-900">{fmt(data[k].billed)}</span> · unpaid{" "}
              <span className={`tabular-nums font-medium ${data[k].unpaid > 0 ? "text-expense" : "text-income"}`}>{fmt(data[k].unpaid)}</span>
            </p>
          ))}
          {data.notYetInvoiced > 0 && <p className="text-gray-500">{fmt(data.notYetInvoiced)} approved, not invoiced yet</p>}
        </div>
        <a
          href={`/api/tenants/${tenantId}/utilities?format=pdf`}
          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-body font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} className="mr-1" /> Utility statement
        </a>
      </div>

      <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
        {data.readings.map((r) => {
          const badge = UTILITY_PAYMENT_BADGE[r.paymentStatus];
          return (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-body text-gray-900">{r.description}</p>
                <p className="text-caption text-gray-500">
                  {r.invoiceNumber ? (
                    <Link href={`/invoices?focus=${r.invoiceId}`} className="text-gold-dark hover:underline">{r.invoiceNumber}</Link>
                  ) : "Not on an invoice yet"}
                </p>
              </div>
              {r.photoUrls.length > 0 && <PhotoStrip urls={r.photoUrls} size="sm" />}
              <span className="text-body tabular-nums text-gray-900 w-24 text-right">{fmt(r.amount)}</span>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
