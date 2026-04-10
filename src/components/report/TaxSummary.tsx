"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { FileDown, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { clsx } from "clsx";
import { formatCurrency } from "@/lib/currency";
import { useProperty } from "@/lib/property-context";
import type { ReportData } from "@/types/report";

interface TaxSummaryTabProps {
  year: string;
  month: string;
  selectedId?: string | null;
}

function TaxKpiCard({
  label,
  sublabel,
  value,
  currency,
  color,
  borderColor,
  bgColor,
}: {
  label: string;
  sublabel: string;
  value: number;
  currency: string;
  color: string;
  borderColor: string;
  bgColor: string;
}) {
  return (
    <div className={clsx("rounded-xl p-4 border-l-4", bgColor, borderColor)}>
      <p className="text-xs font-sans font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs text-gray-400 font-sans mb-2">{sublabel}</p>
      <CurrencyDisplay currency={currency} amount={value} className={clsx("font-semibold", color)} size="lg" />
    </div>
  );
}

function exportTaxSummary(
  tax: NonNullable<ReportData["taxSummary"]>,
  currency: string,
  period: string,
) {
  const rows = [
    ["Tax Summary", period],
    [],
    ["Category", "Amount"],
    ["Output VAT (collected on income)", tax.outputTaxAdditive],
    ["Input VAT (paid on expenses)", tax.inputTaxAdditive],
    ["Net VAT Liability", tax.netVatLiability],
    ["WHT deducted from owner remittances", tax.outputTaxWithheld],
    ["WHT withheld from contractor payments", tax.inputTaxWithheld],
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) =>
          typeof cell === "number"
            ? formatCurrency(cell, currency)
            : String(cell ?? ""),
        )
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tax-summary-${period.replace(/\s/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TaxSummaryTab({ year, month, selectedId }: TaxSummaryTabProps) {
  const { selected } = useProperty();
  const currency = selected?.currency ?? "USD";

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const qs = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/report?year=${year}&month=${month}${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month, selectedId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-center text-gray-400 text-sm py-16">
        Failed to load report data.
      </p>
    );
  }

  const tax = data.taxSummary;

  if (!tax || !tax.hasAnyTax) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
            <Info size={22} className="text-gray-400" />
          </div>
          <p className="font-display text-base text-header">No Tax Data for This Period</p>
          <p className="text-sm text-gray-400 font-sans max-w-xs">
            No VAT or withholding tax was recorded on income or expenses in{" "}
            {data.period}. Configure tax rates in <strong>Settings → Tax</strong> to
            start tracking.
          </p>
        </div>
      </Card>
    );
  }

  const periodLabel = data.period;
  const hasVat = tax.outputTaxAdditive > 0 || tax.inputTaxAdditive > 0;
  const hasWht = tax.outputTaxWithheld > 0 || tax.inputTaxWithheld > 0;
  const netIsLiability = tax.netVatLiability > 0;
  const netIsCredit = tax.netVatLiability < 0;

  return (
    <div className="space-y-5">
      {/* Export */}
      <div className="flex justify-end">
        <button
          onClick={() => exportTaxSummary(tax, currency, periodLabel)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
        >
          <FileDown size={13} /> Export CSV
        </button>
      </div>

      {/* VAT Section */}
      {hasVat && (
        <Card>
          <h3 className="font-display text-base text-header mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <span className="w-2 h-5 rounded bg-gold inline-block" />
            VAT Summary — {periodLabel}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <TaxKpiCard
              label="Output VAT"
              sublabel="VAT collected on income"
              value={tax.outputTaxAdditive}
              currency={currency}
              color="text-expense"
              borderColor="border-expense"
              bgColor="bg-red-50"
            />
            <TaxKpiCard
              label="Input VAT"
              sublabel="VAT paid on expenses"
              value={tax.inputTaxAdditive}
              currency={currency}
              color="text-income"
              borderColor="border-income"
              bgColor="bg-emerald-50"
            />
            <TaxKpiCard
              label="Net VAT Position"
              sublabel={netIsLiability ? "Amount owed to authority" : netIsCredit ? "Credit / refund claimable" : "Balanced"}
              value={Math.abs(tax.netVatLiability)}
              currency={currency}
              color={netIsLiability ? "text-expense" : netIsCredit ? "text-income" : "text-gray-500"}
              borderColor={netIsLiability ? "border-expense" : netIsCredit ? "border-income" : "border-gray-200"}
              bgColor={netIsLiability ? "bg-red-50" : netIsCredit ? "bg-emerald-50" : "bg-gray-50"}
            />
          </div>

          {/* VAT Statement */}
          <div className="bg-cream rounded-xl p-4 max-w-sm space-y-2">
            <p className="text-xs font-medium font-sans text-header uppercase tracking-wide mb-3">
              VAT Statement
            </p>
            {[
              { label: "Output VAT (owed to authority)", value: tax.outputTaxAdditive, sign: "" },
              { label: "Less: Input VAT (claimable)",    value: -tax.inputTaxAdditive, sign: "−" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-sm font-sans text-gray-600">{row.label}</span>
                <span className={clsx(
                  "font-mono text-sm",
                  row.value < 0 ? "text-income" : "text-expense",
                )}>
                  {row.value < 0 ? "(" : ""}{formatCurrency(Math.abs(row.value), currency)}{row.value < 0 ? ")" : ""}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t-2 border-gray-200">
              <span className="text-sm font-semibold font-sans text-header">
                Net VAT {netIsLiability ? "Liability" : netIsCredit ? "Credit" : "Position"}
              </span>
              <span className={clsx(
                "font-mono text-sm font-bold",
                netIsLiability ? "text-expense" : netIsCredit ? "text-income" : "text-gray-500",
              )}>
                {formatCurrency(Math.abs(tax.netVatLiability), currency)}
                {netIsCredit && " CR"}
              </span>
            </div>
          </div>

          {/* Advisory notice */}
          <div className={clsx(
            "flex items-start gap-3 mt-4 p-3.5 rounded-xl border text-sm font-sans",
            netIsLiability
              ? "bg-amber-50 border-amber-100 text-amber-700"
              : netIsCredit
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-gray-50 border-gray-100 text-gray-500",
          )}>
            {netIsLiability ? (
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            ) : (
              <CheckCircle size={15} className="shrink-0 mt-0.5" />
            )}
            {netIsLiability ? (
              <span>
                Net VAT of <strong>{formatCurrency(tax.netVatLiability, currency)}</strong> is
                owed to the tax authority for {periodLabel}. Ensure this is remitted before the
                filing deadline.
              </span>
            ) : netIsCredit ? (
              <span>
                Input VAT exceeds output VAT by{" "}
                <strong>{formatCurrency(Math.abs(tax.netVatLiability), currency)}</strong> — a
                credit is available for reclaim in {periodLabel}.
              </span>
            ) : (
              <span>VAT is balanced for {periodLabel} — no net payment or refund due.</span>
            )}
          </div>
        </Card>
      )}

      {/* Withholding Tax Section */}
      {hasWht && (
        <Card>
          <h3 className="font-display text-base text-header mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <span className="w-2 h-5 rounded bg-gold inline-block" />
            Withholding Tax (WHT) — {periodLabel}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {tax.outputTaxWithheld > 0 && (
              <TaxKpiCard
                label="WHT on Owner Remittances"
                sublabel="Withheld before paying owner"
                value={tax.outputTaxWithheld}
                currency={currency}
                color="text-expense"
                borderColor="border-amber-400"
                bgColor="bg-amber-50"
              />
            )}
            {tax.inputTaxWithheld > 0 && (
              <TaxKpiCard
                label="WHT on Contractor Payments"
                sublabel="Withheld from contractor invoices"
                value={tax.inputTaxWithheld}
                currency={currency}
                color="text-amber-600"
                borderColor="border-amber-400"
                bgColor="bg-amber-50"
              />
            )}
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-sm font-sans text-amber-700">
            <Info size={15} className="shrink-0 mt-0.5" />
            <span>
              Withholding tax amounts are deducted at source before remittance. These must be
              declared and remitted to the tax authority separately from VAT returns.
            </span>
          </div>
        </Card>
      )}

      {/* Vendor VAT note */}
      {data.vendorSpend && data.vendorSpend.length > 0 && (
        <Card className="border border-dashed border-gray-200 bg-gray-50/50">
          <div className="flex items-start gap-3">
            <Info size={15} className="text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium font-sans text-gray-600 mb-1">Vendor-Level VAT</p>
              <p className="text-xs text-gray-400 font-sans">
                To see VAT broken down per vendor, go to the{" "}
                <strong>P&L Preview</strong> tab and expand the Vendor Spend section. VAT is
                recorded at the expense line item level when the expense is linked to a
                VAT-registered vendor.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
