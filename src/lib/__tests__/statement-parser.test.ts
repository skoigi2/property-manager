import { describe, it, expect } from "vitest";
import { parseStatement } from "../statement-parser";

describe("parseStatement", () => {
  it("parses M-Pesa confirmation lines (code, amount, payer, date)", () => {
    const text = [
      "TFA1BC2DEF Confirmed. Ksh85,000.00 received from JOHN KAMAU 254712345678 on 1/8/26 at 2:15 PM",
      "TFA9XY8GHI Confirmed. Ksh12,500.50 received from MARY WANJIKU on 28/7/26 at 9:02 AM",
    ].join("\n");
    const lines = parseStatement(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      amount: 85000,
      reference: "TFA1BC2DEF",
      description: "JOHN KAMAU",
      date: "2026-08-01",
    });
    expect(lines[1]).toMatchObject({ amount: 12500.5, description: "MARY WANJIKU", date: "2026-07-28" });
  });

  it("parses a headered CSV export and keeps only credits", () => {
    const text = [
      "Date,Details,Reference,Amount",
      "01/08/2026,RENT JOHN KAMAU UNIT 4B,FT26213001,85000.00",
      "02/08/2026,BANK CHARGES,CHG-1,-350.00",
      '03/08/2026,"TRANSFER FROM MARY, WANJIKU",FT26215002,110000.00',
    ].join("\n");
    const lines = parseStatement(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      amount: 85000,
      date: "2026-08-01",
      description: "RENT JOHN KAMAU UNIT 4B",
      reference: "FT26213001",
    });
    // negative (debit) row dropped
    expect(lines.some((l) => l.description?.includes("BANK CHARGES"))).toBe(false);
  });

  it("parses a TSV paste from Excel", () => {
    const text = "Date\tNarrative\tAmount\n2026-08-01\tRent transfer J Kamau\t85,000.00";
    const lines = parseStatement(text);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amount: 85000, date: "2026-08-01", description: "Rent transfer J Kamau" });
  });

  it("handles free-form lines with plain decimal amounts", () => {
    const lines = parseStatement("Payment received 45,000.00 from Peter O.");
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(45000);
  });

  it("returns nothing for empty or amount-free input", () => {
    expect(parseStatement("")).toHaveLength(0);
    expect(parseStatement("hello world\nno numbers here")).toHaveLength(0);
  });

  it("two-digit years resolve to the 2000s, day-first", () => {
    const lines = parseStatement("ABC1234567 Confirmed. Ksh10,000.00 received from JANE DOE on 5/1/26");
    expect(lines[0].date).toBe("2026-01-05");
  });
});
