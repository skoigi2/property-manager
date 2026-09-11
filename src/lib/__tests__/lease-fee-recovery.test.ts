import { describe, it, expect } from "vitest";
import {
  leaseFeeRecoveryStatus,
  pendingLeaseFeeRecoveries,
  recoveryLineItem,
} from "../lease-fee-recovery";

const fee1 = { id: "e1", date: new Date("2026-09-10"), grossAmount: 2000, unitId: "u1", tenantId: "t1", tenantName: "Muhidin Haji Muhumed", unitNumber: "2.11" };
const fee2 = { id: "e2", date: new Date("2026-09-12"), grossAmount: 2000, unitId: "u2", tenantId: "t2", tenantName: "Ivana Kyla Kadenge", unitNumber: "3.11" };
const fee3 = { id: "e3", date: new Date("2026-10-02"), grossAmount: 2500, unitId: "u3", tenantId: "t3", tenantName: "New Tenant", unitNumber: "4.11" };

const invPaid = { id: "o1", invoiceNumber: "OWN-202609-0004", status: "PAID", lineItems: [
  { description: "Management Fee", amount: 2295, incomeType: "OTHER" },
  { description: "Lease preparation fee recovery — Muhidin", amount: 2000, incomeType: "OTHER", refIncomeEntryId: "e1", isRecovery: true },
] };
const invDraft = { id: "o2", invoiceNumber: "OWN-202610-0001", status: "DRAFT", lineItems: [
  { description: "Lease preparation fee recovery — Ivana", amount: 2000, incomeType: "OTHER", refIncomeEntryId: "e2", isRecovery: true },
] };
const invCancelled = { id: "o3", invoiceNumber: "OWN-202610-0002", status: "CANCELLED", lineItems: [
  { description: "Lease preparation fee recovery — New", amount: 2500, incomeType: "OTHER", refIncomeEntryId: "e3", isRecovery: true },
] };

describe("pendingLeaseFeeRecoveries", () => {
  it("returns fees no non-cancelled owner invoice recovers", () => {
    const pending = pendingLeaseFeeRecoveries([fee1, fee2, fee3], [invPaid, invDraft, invCancelled]);
    expect(pending.map((e) => e.id)).toEqual(["e3"]);
  });

  it("treats a removed / cancelled line as pending again", () => {
    expect(pendingLeaseFeeRecoveries([fee1], [{ ...invPaid, lineItems: [] }]).map((e) => e.id)).toEqual(["e1"]);
    expect(pendingLeaseFeeRecoveries([fee3], [invCancelled]).map((e) => e.id)).toEqual(["e3"]);
  });
});

describe("recoveryLineItem", () => {
  it("references the tenant's entry, keeps the tenant off the line and is not a fee", () => {
    const li = recoveryLineItem(fee1, (n) => `KES ${n.toLocaleString("en-US")}`);
    expect(li.refIncomeEntryId).toBe("e1");
    expect(li.refTenantId).toBe("t1");
    expect(li.tenantId).toBeNull();
    expect(li.amount).toBe(2000);
    expect(li.isRecovery).toBe(true);
    expect(li.description).toContain("Muhidin Haji Muhumed, Unit 2.11");
    expect(li.description).toContain("KES 2,000");
  });
});

describe("leaseFeeRecoveryStatus", () => {
  it("splits collected into settled / invoiced / pending", () => {
    const s = leaseFeeRecoveryStatus([fee1, fee2, fee3], [invPaid, invDraft, invCancelled]);
    expect(s.collected).toBe(6500);
    expect(s.invoiced).toBe(4000);
    expect(s.settled).toBe(2000);
    expect(s.pending).toBe(2500);
    expect(s.rows.map((r) => [r.id, r.state, r.ownerInvoiceNumber])).toEqual([
      ["e3", "PENDING", null],
      ["e2", "INVOICED", "OWN-202610-0001"],
      ["e1", "SETTLED", "OWN-202609-0004"],
    ]);
  });
});
