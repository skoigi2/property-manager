import { describe, it, expect } from "vitest";
import { incomeEntrySchema } from "../validations";

// Regression: the Income form registers tenantId / invoiceId as hidden
// inputs, which react-hook-form submits as "" when nothing is linked. An
// empty string used to be passed straight into the FK columns, so every
// non-rent entry (DEPOSIT, SERVICE_CHARGE, …) failed with a 500.
describe("incomeEntrySchema — empty hidden fields", () => {
  const base = { date: "2026-09-05", unitId: "unit_1", type: "DEPOSIT", grossAmount: "50000" };

  it("treats empty tenantId / invoiceId as not provided", () => {
    const parsed = incomeEntrySchema.parse({ ...base, tenantId: "", invoiceId: "" });
    expect(parsed.tenantId).toBeUndefined();
    expect(parsed.invoiceId).toBeUndefined();
  });

  it("keeps real ids", () => {
    const parsed = incomeEntrySchema.parse({ ...base, tenantId: "t1", invoiceId: "inv1" });
    expect(parsed.tenantId).toBe("t1");
    expect(parsed.invoiceId).toBe("inv1");
  });

  it("defaults an empty commission to 0 and ignores stale Airbnb-only fields", () => {
    const parsed = incomeEntrySchema.parse({ ...base, agentCommission: "", platform: "", agentName: "", nightlyRate: "" });
    expect(parsed.agentCommission).toBe(0);
    expect(parsed.platform).toBeUndefined();
    expect(parsed.agentName).toBeUndefined();
    expect(parsed.nightlyRate).toBeUndefined();
    expect(parsed.grossAmount).toBe(50000);
  });

  it("still rejects an invalid platform", () => {
    expect(incomeEntrySchema.safeParse({ ...base, platform: "EBAY" }).success).toBe(false);
  });
});
