import { describe, it, expect } from "vitest";
import { matchImportedInvoicePayments, type ImportPayment } from "@/lib/invoice-import-match";

const pay = (id: string, grossAmount: number, type = "LONGTERM_RENT", utilityType: string | null = null): ImportPayment =>
  ({ id, grossAmount, type, utilityType });
const lines = (rentSide: number, deposit = 0, leaseFee = 0, wifi = 0) => ({ rentSide, deposit, leaseFee, wifi });

describe("matchImportedInvoicePayments", () => {
  it("links a rent-only invoice to exactly one rent-side payment for the total", () => {
    expect(matchImportedInvoicePayments([pay("a", 50_000)], lines(50_000))).toEqual({ outcome: "matched", ids: ["a"] });
    expect(matchImportedInvoicePayments([pay("a", 50_000, "SERVICE_CHARGE")], lines(50_000))).toEqual({ outcome: "matched", ids: ["a"] });
    expect(matchImportedInvoicePayments([pay("a", 49_000)], lines(50_000))).toEqual({ outcome: "none" });
    expect(matchImportedInvoicePayments([pay("a", 50_000), pay("b", 50_000)], lines(50_000))).toEqual({ outcome: "ambiguous" });
    // A deposit receipt of the same amount is not rent.
    expect(matchImportedInvoicePayments([pay("d", 50_000, "DEPOSIT")], lines(50_000))).toEqual({ outcome: "none" });
  });

  it("needs one payment of the right type per line on a move-in invoice", () => {
    const pool = [pay("r", 50_000), pay("d", 100_000, "DEPOSIT"), pay("l", 5_000, "LEASE_FEE"), pay("w", 3_000, "UTILITY_RECOVERY", "WIFI")];
    const m = matchImportedInvoicePayments(pool, lines(50_000, 100_000, 5_000, 3_000));
    expect(m.outcome).toBe("matched");
    expect(m.outcome === "matched" && [...m.ids].sort()).toEqual(["d", "l", "r", "w"]);
  });

  it("links nothing when a line has no payment (all or nothing)", () => {
    expect(matchImportedInvoicePayments([pay("r", 50_000)], lines(50_000, 100_000))).toEqual({ outcome: "none" });
    // Water recovery is not Wi-Fi.
    expect(matchImportedInvoicePayments([pay("r", 50_000), pay("w", 3_000, "UTILITY_RECOVERY", "WATER")], lines(50_000, 0, 0, 3_000)))
      .toEqual({ outcome: "none" });
  });

  it("flags one lump payment for the whole move-in invoice instead of booking the deposit as rent", () => {
    expect(matchImportedInvoicePayments([pay("x", 150_000)], lines(50_000, 100_000))).toEqual({ outcome: "lump" });
  });

  it("is ambiguous when two payments fit a line, and never uses one payment twice", () => {
    expect(matchImportedInvoicePayments([pay("r", 50_000), pay("d1", 50_000, "DEPOSIT"), pay("d2", 50_000, "DEPOSIT")], lines(50_000, 50_000)))
      .toEqual({ outcome: "ambiguous" });
    // Deposit-only invoice (rent 0): just the deposit receipt.
    expect(matchImportedInvoicePayments([pay("d", 80_000, "DEPOSIT")], lines(0, 80_000))).toEqual({ outcome: "matched", ids: ["d"] });
  });
});
