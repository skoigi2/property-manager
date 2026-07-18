import { describe, it, expect } from "vitest";
import { formatInvoiceNumber, DEFAULT_INVOICE_FORMAT } from "../invoice-numbering";

const jul2026 = new Date(2026, 6, 1);

describe("formatInvoiceNumber", () => {
  it("renders the default format like the legacy numbers", () => {
    expect(formatInvoiceNumber(DEFAULT_INVOICE_FORMAT, 12, jul2026)).toBe("INV-202607-0012");
  });

  it("supports year/month tokens", () => {
    expect(formatInvoiceNumber("SHAH-{YYYY}-{SEQ}", 14, jul2026)).toBe("SHAH-2026-0014");
    expect(formatInvoiceNumber("{YY}/{MM}/{SEQ}", 5, jul2026)).toBe("26/07/0005");
  });

  it("appends a sequence when the format forgets {SEQ}", () => {
    expect(formatInvoiceNumber("SHAH-{YYYY}", 3, jul2026)).toBe("SHAH-2026-0003");
  });

  it("pads the sequence to four digits and grows beyond", () => {
    expect(formatInvoiceNumber("A-{SEQ}", 7, jul2026)).toBe("A-0007");
    expect(formatInvoiceNumber("A-{SEQ}", 12345, jul2026)).toBe("A-12345");
  });

  it("replaces repeated tokens", () => {
    expect(formatInvoiceNumber("{YYYY}-{YYYY}-{SEQ}", 1, jul2026)).toBe("2026-2026-0001");
  });
});
