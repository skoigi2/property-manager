import { describe, it, expect } from "vitest";
import type { TaxConfiguration } from "@prisma/client";
import {
  calcTax,
  matchConfig,
  buildTaxSnapshot,
  buildTaxSummary,
  lineItemCategoryToAppliesTo,
  taxLabel,
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
