import { describe, it, expect } from "vitest";
import type { TaxConfiguration } from "@prisma/client";
import {
  calcTax,
  matchConfig,
  buildTaxSnapshot,
  buildTaxSummary,
  expenseTaxItems,
  lineItemCategoryToAppliesTo,
  taxLabel,
  resolveEffectiveTaxConfigs,
} from "@/lib/tax-engine";

const cfg = (over: Partial<TaxConfiguration>): TaxConfiguration =>
  ({
    id: "cfg1",
    label: "VAT",
    type: "ADDITIVE",
    rate: 0.16,
    isInclusive: false,
    appliesTo: ["LONGTERM_RENT"],
    ...over,
  }) as TaxConfiguration;

describe("calcTax", () => {
  it("ADDITIVE exclusive: adds tax on top", () => {
    const r = calcTax(10000, cfg({ rate: 0.16 }));
    expect(r).toEqual({ taxAmount: 1600, netAmount: 10000, grossAmount: 11600 });
  });

  it("ADDITIVE inclusive: extracts tax from a gross amount", () => {
    const r = calcTax(11600, cfg({ rate: 0.16, isInclusive: true }));
    expect(r.taxAmount).toBe(1600);
    expect(r.netAmount).toBe(10000);
    expect(r.grossAmount).toBe(11600);
  });

  it("WITHHELD: deducts from gross", () => {
    const r = calcTax(10000, cfg({ type: "WITHHELD", rate: 0.05, label: "WHT" }));
    expect(r).toEqual({ taxAmount: 500, netAmount: 9500, grossAmount: 10000 });
  });

  it("rounds to 2 decimal places", () => {
    const r = calcTax(999.99, cfg({ rate: 0.16 }));
    expect(r.taxAmount).toBe(160.0);
    expect(r.grossAmount).toBe(1159.99);
  });
});

describe("matchConfig", () => {
  it("returns the first config matching appliesTo, else null", () => {
    const configs = [
      cfg({ id: "a", appliesTo: ["AIRBNB"] }),
      cfg({ id: "b", appliesTo: ["LONGTERM_RENT", "SERVICE_CHARGE"] }),
    ];
    expect(matchConfig(configs, "LONGTERM_RENT")?.id).toBe("b");
    expect(matchConfig(configs, "MANAGEMENT_FEE_INCOME")).toBeNull();
  });
});

describe("buildTaxSnapshot", () => {
  it("returns all-null fields with no config (tax not applicable)", () => {
    expect(buildTaxSnapshot(10000, null)).toEqual({
      taxConfigId: null,
      taxRate: null,
      taxAmount: null,
      taxType: null,
    });
  });

  it("snapshots config id, rate, type and computed amount", () => {
    expect(buildTaxSnapshot(10000, cfg({ rate: 0.16 }))).toEqual({
      taxConfigId: "cfg1",
      taxRate: 0.16,
      taxAmount: 1600,
      taxType: "ADDITIVE",
    });
  });
});

describe("expenseTaxItems", () => {
  it("uses line items when present and synthesises an ADDITIVE item from a plain expense's vatAmount", () => {
    const items = expenseTaxItems([
      { vatAmount: 999, lineItems: [{ taxAmount: 40, taxType: "ADDITIVE", isVatable: true }] },
      { vatAmount: 160, lineItems: [] },
      { vatAmount: 0 },
      { vatAmount: null, lineItems: null },
    ]);
    expect(items).toEqual([
      { taxAmount: 40, taxType: "ADDITIVE", isVatable: true },
      { taxAmount: 160, taxType: "ADDITIVE", isVatable: true },
    ]);
    expect(buildTaxSummary([], items).inputTaxAdditive).toBe(200);
  });
});

describe("buildTaxSummary", () => {
  it("aggregates output/input tax by type and nets VAT liability", () => {
    const income = [
      { taxAmount: 1600, taxType: "ADDITIVE" },
      { taxAmount: 500, taxType: "WITHHELD" },
      { taxAmount: null, taxType: null }, // untaxed entry ignored
    ] as never[];
    const lineItems = [
      { taxAmount: 400, taxType: "ADDITIVE", isVatable: true },
      { taxAmount: 999, taxType: "ADDITIVE", isVatable: false }, // not vatable — ignored
      { taxAmount: 100, taxType: "WITHHELD", isVatable: true },
    ] as never[];

    const s = buildTaxSummary(income, lineItems);
    expect(s.outputTaxAdditive).toBe(1600);
    expect(s.outputTaxWithheld).toBe(500);
    expect(s.inputTaxAdditive).toBe(400);
    expect(s.inputTaxWithheld).toBe(100);
    expect(s.netVatLiability).toBe(1200);
    expect(s.hasAnyTax).toBe(true);
  });

  it("flags hasAnyTax=false when everything is zero", () => {
    const s = buildTaxSummary([], []);
    expect(s.hasAnyTax).toBe(false);
    expect(s.netVatLiability).toBe(0);
  });
});

describe("resolveEffectiveTaxConfigs (rate over time)", () => {
  // A VAT rate change: 16% until 2026-06-30, 18% from 2026-07-01.
  const oldRate = cfg({ id: "vat-16", rate: 0.16, propertyId: null, effectiveFrom: new Date("2020-01-01") } as never);
  const newRate = cfg({ id: "vat-18", rate: 0.18, propertyId: null, effectiveFrom: new Date("2026-07-01") } as never);

  it("a transaction dated before the rate change gets the old rate", () => {
    const r = resolveEffectiveTaxConfigs([oldRate, newRate], new Date("2026-06-15"));
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("vat-16");
    expect(r[0].rate).toBe(0.16);
  });

  it("a transaction dated on/after the rate change gets the new rate", () => {
    expect(resolveEffectiveTaxConfigs([oldRate, newRate], new Date("2026-07-01"))[0].id).toBe("vat-18");
    expect(resolveEffectiveTaxConfigs([oldRate, newRate], new Date("2026-12-31"))[0].rate).toBe(0.18);
  });

  it("ignores future-dated configs entirely", () => {
    const futureOnly = resolveEffectiveTaxConfigs([newRate], new Date("2026-01-01"));
    expect(futureOnly).toHaveLength(0);
  });

  it("property-specific config beats the org default in force", () => {
    const propOverride = cfg({ id: "vat-prop", rate: 0.2, propertyId: "prop1", effectiveFrom: new Date("2021-01-01") } as never);
    const r = resolveEffectiveTaxConfigs([oldRate, propOverride], new Date("2026-06-15"));
    expect(r[0].id).toBe("vat-prop");
  });

  it("adding a newer config row leaves a historical record's stored snapshot untouched", () => {
    // The snapshot is computed once at entry time from the rate then in force,
    // and stored as an absolute taxAmount — never recomputed on read.
    const entryDate = new Date("2026-06-15");
    const snapshotAtEntry = buildTaxSnapshot(
      10000,
      matchConfig(resolveEffectiveTaxConfigs([oldRate], entryDate), "LONGTERM_RENT"),
    );
    expect(snapshotAtEntry.taxAmount).toBe(1600);

    // Later, the 18% row is added. Re-resolving FOR THE SAME ENTRY DATE still
    // yields 16% — and the stored snapshot object itself was never derived
    // from live config on read, so it cannot drift.
    const reResolved = buildTaxSnapshot(
      10000,
      matchConfig(resolveEffectiveTaxConfigs([oldRate, newRate], entryDate), "LONGTERM_RENT"),
    );
    expect(reResolved).toEqual(snapshotAtEntry);
  });

  it("keeps one config per label:type pair (different taxes coexist)", () => {
    const wht = cfg({ id: "wht", label: "WHT", type: "WITHHELD", rate: 0.05, propertyId: null, effectiveFrom: new Date("2020-01-01") } as never);
    const r = resolveEffectiveTaxConfigs([oldRate, newRate, wht], new Date("2026-08-01"));
    expect(r.map((c) => c.id).sort()).toEqual(["vat-18", "wht"]);
  });
});

describe("helpers", () => {
  it("maps line-item categories to appliesTo values", () => {
    expect(lineItemCategoryToAppliesTo("LABOUR")).toBe("CONTRACTOR_LABOUR");
    expect(lineItemCategoryToAppliesTo("MATERIAL")).toBe("CONTRACTOR_MATERIALS");
    expect(lineItemCategoryToAppliesTo("ANYTHING_ELSE")).toBe("VENDOR_INVOICE");
  });

  it("renders a human-readable tax label", () => {
    expect(taxLabel(cfg({ label: "VAT", rate: 0.16 }))).toBe("VAT (16%)");
  });
});
