/**
 * Tax Engine — pure calculation functions, no side effects.
 *
 * Supports two tax types:
 *   ADDITIVE  — VAT / GST: added on top of net amount; increases invoice total.
 *   WITHHELD  — WHT / TDS: deducted from gross before remitting to owner/vendor.
 *
 * All configurations are opt-in at property level.
 * An unconfigured property returns null snapshots — identical to current behaviour.
 *
 * appliesTo values (income side):
 *   "LONGTERM_RENT" | "AIRBNB" | "SERVICE_CHARGE" | "MANAGEMENT_FEE_INCOME" | "LETTING_FEE_INCOME"
 *
 * appliesTo values (expense side):
 *   "CONTRACTOR_LABOUR" | "CONTRACTOR_MATERIALS" | "VENDOR_INVOICE"
 */

import { prisma } from "@/lib/prisma";
import type { TaxConfiguration, TaxType, IncomeEntry, ExpenseLineItem } from "@prisma/client";

export type { TaxConfiguration };

// ─── Config loading ────────────────────────────────────────────────────────────

/**
 * Returns active tax configurations for a property.
 * Merges org-level defaults (propertyId = null) with property-specific overrides.
 * Property-specific configs take precedence over org defaults for the same label.
 */
export async function getActiveTaxConfigs(
  propertyId: string,
  orgId: string
): Promise<TaxConfiguration[]> {
  const configs = await prisma.taxConfiguration.findMany({
    where: {
      orgId,
      isActive: true,
      OR: [
        { propertyId: null },          // org-level defaults
        { propertyId },                 // property-specific overrides
      ],
    },
    orderBy: [
      { propertyId: "desc" },          // property-specific first (nulls last)
      { effectiveFrom: "desc" },        // latest effective date first
    ],
  });

  // Deduplicate: if a property-specific config exists for a label, it wins over the org default
  const seen = new Set<string>();
  const deduped: TaxConfiguration[] = [];
  for (const c of configs) {
    const key = `${c.label}:${c.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }
  return deduped;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * Returns the first active config whose appliesTo list contains the given value.
 * Returns null if none match (tax not applicable).
 */
export function matchConfig(
  configs: TaxConfiguration[],
  appliesTo: string
): TaxConfiguration | null {
  return configs.find((c) => c.appliesTo.includes(appliesTo)) ?? null;
}

// ─── Calculation ──────────────────────────────────────────────────────────────

export interface TaxCalcResult {
  taxAmount: number;    // always positive
  netAmount: number;    // amount excluding tax
  grossAmount: number;  // amount including tax (for ADDITIVE) or original amount (for WITHHELD)
}

/**
 * Compute tax amounts for a given gross amount and config.
 *
 * ADDITIVE exclusive:  taxAmount = amount × rate; grossAmount = amount + taxAmount
 * ADDITIVE inclusive:  taxAmount = amount − (amount / (1 + rate)); netAmount = amount − taxAmount
 * WITHHELD:            taxAmount = amount × rate; netAmount = amount − taxAmount (paid to vendor/owner)
 */
export function calcTax(amount: number, config: TaxConfiguration): TaxCalcResult {
  const rate = config.rate;

  if (config.type === "ADDITIVE") {
    if (config.isInclusive) {
      // Extract tax from an amount that already includes it
      const taxAmount = round2(amount - amount / (1 + rate));
      return {
        taxAmount,
        netAmount: round2(amount - taxAmount),
        grossAmount: amount,
      };
    } else {
      const taxAmount = round2(amount * rate);
      return {
        taxAmount,
        netAmount: amount,
        grossAmount: round2(amount + taxAmount),
      };
    }
  } else {
    // WITHHELD — deducted from gross, vendor/owner receives net
    const taxAmount = round2(amount * rate);
    return {
      taxAmount,
      netAmount: round2(amount - taxAmount),
      grossAmount: amount,
    };
  }
}

// ─── Snapshot builder ────────────────────────────────────────────────────────

export interface TaxSnapshot {
  taxConfigId: string | null;
  taxRate: number | null;
  taxAmount: number | null;
  taxType: TaxType | null;
}

/**
 * Build the snapshot fields to save on IncomeEntry or ExpenseLineItem at creation time.
 * Passing null config produces all-null fields — stored as-is, no tax applied.
 */
export function buildTaxSnapshot(
  amount: number,
  config: TaxConfiguration | null
): TaxSnapshot {
  if (!config) {
    return { taxConfigId: null, taxRate: null, taxAmount: null, taxType: null };
  }
  const { taxAmount } = calcTax(amount, config);
  return {
    taxConfigId: config.id,
    taxRate: config.rate,
    taxAmount,
    taxType: config.type,
  };
}

// ─── Report aggregation ──────────────────────────────────────────────────────

export interface TaxSummary {
  outputTaxAdditive: number;  // VAT/GST collected on income (owed to tax authority)
  outputTaxWithheld: number;  // WHT deducted from owner remittances
  inputTaxAdditive: number;   // VAT/GST paid on expenses (potentially reclaimable)
  inputTaxWithheld: number;   // WHT withheld from contractor payments
  netVatLiability: number;    // outputTaxAdditive − inputTaxAdditive
  hasAnyTax: boolean;         // convenience flag — false when all zeros
}

/**
 * Aggregate tax figures from a period's income entries and expense line items.
 * Used by the report builder to populate the Tax Summary section.
 */
export function buildTaxSummary(
  incomeEntries: Pick<IncomeEntry, "taxAmount" | "taxType">[],
  expenseLineItems: Pick<ExpenseLineItem, "taxAmount" | "taxType" | "isVatable">[]
): TaxSummary {
  let outputTaxAdditive = 0;
  let outputTaxWithheld = 0;
  let inputTaxAdditive = 0;
  let inputTaxWithheld = 0;

  for (const e of incomeEntries) {
    if (!e.taxAmount || !e.taxType) continue;
    if (e.taxType === "ADDITIVE") outputTaxAdditive += e.taxAmount;
    else outputTaxWithheld += e.taxAmount;
  }

  for (const li of expenseLineItems) {
    if (!li.isVatable || !li.taxAmount || !li.taxType) continue;
    if (li.taxType === "ADDITIVE") inputTaxAdditive += li.taxAmount;
    else inputTaxWithheld += li.taxAmount;
  }

  const netVatLiability = round2(outputTaxAdditive - inputTaxAdditive);

  return {
    outputTaxAdditive: round2(outputTaxAdditive),
    outputTaxWithheld: round2(outputTaxWithheld),
    inputTaxAdditive: round2(inputTaxAdditive),
    inputTaxWithheld: round2(inputTaxWithheld),
    netVatLiability,
    hasAnyTax:
      outputTaxAdditive > 0 ||
      outputTaxWithheld > 0 ||
      inputTaxAdditive > 0 ||
      inputTaxWithheld > 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map LineItemCategory → appliesTo string for config matching.
 */
export function lineItemCategoryToAppliesTo(category: string): string {
  switch (category) {
    case "LABOUR": return "CONTRACTOR_LABOUR";
    case "MATERIAL": return "CONTRACTOR_MATERIALS";
    default: return "VENDOR_INVOICE";
  }
}

/**
 * Human-readable label for a tax config, e.g. "VAT (16%)"
 */
export function taxLabel(config: TaxConfiguration): string {
  return `${config.label} (${(config.rate * 100).toFixed(0)}%)`;
}
