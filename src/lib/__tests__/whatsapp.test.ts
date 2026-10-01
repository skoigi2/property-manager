import { describe, it, expect } from "vitest";
import {
  normalizePhoneForWhatsApp as norm,
  dialCodeForCurrency,
  buildWhatsAppLink,
  displayWhatsAppNumber,
} from "../whatsapp";

describe("normalizePhoneForWhatsApp", () => {
  it("Kenyan numbers in every common shape", () => {
    expect(norm("+254 712 345 678")).toBe("254712345678");
    expect(norm("+254712345678")).toBe("254712345678");
    expect(norm("00254-712-345-678")).toBe("254712345678");
    expect(norm("254712345678")).toBe("254712345678");
    expect(norm("(+254) 712.345.678")).toBe("254712345678");
    expect(norm("0712 345 678", "254")).toBe("254712345678");
    expect(norm("0712345678", "254")).toBe("254712345678");
  });

  it("Somali and UK numbers", () => {
    expect(norm("+252 61 234 5678")).toBe("252612345678");
    expect(norm("00252612345678")).toBe("252612345678");
    expect(norm("+44 7911 123456")).toBe("447911123456");
    expect(norm("07911 123456", "44")).toBe("447911123456");
  });

  it("a leading 0 needs the fallback dial code — no guessing", () => {
    expect(norm("0712345678")).toBeNull();
    expect(norm("0712345678", null)).toBeNull();
    expect(norm("0712345678", "254")).toBe("254712345678");
  });

  it("a short number that lost its leading 0 (Excel) is treated like one", () => {
    expect(norm("712345678", "254")).toBe("254712345678");
    expect(norm(712345678, "254")).toBe("254712345678");
    expect(norm("712345678")).toBeNull();
    // A full international number written without "+" is left alone.
    expect(norm("252612345678", "254")).toBe("252612345678");
  });

  it("rejects garbage, too short and too long", () => {
    expect(norm(null)).toBeNull();
    expect(norm(undefined)).toBeNull();
    expect(norm("")).toBeNull();
    expect(norm("   ")).toBeNull();
    expect(norm("n/a")).toBeNull();
    expect(norm("call reception")).toBeNull();
    expect(norm("+254 712 345 678 ext 4")).toBeNull();
    expect(norm("+25471+2345678")).toBeNull();
    expect(norm("+1234567")).toBeNull(); // 7 digits
    expect(norm("+1234567890123456")).toBeNull(); // 16 digits
    expect(norm("+12345678")).toBe("12345678"); // 8 digits — the minimum
  });
});

describe("dialCodeForCurrency", () => {
  it("maps single-country currencies", () => {
    expect(dialCodeForCurrency("KES")).toBe("254");
    expect(dialCodeForCurrency("TZS")).toBe("255");
    expect(dialCodeForCurrency("UGX")).toBe("256");
    expect(dialCodeForCurrency("ZAR")).toBe("27");
    expect(dialCodeForCurrency("GBP")).toBe("44");
    expect(dialCodeForCurrency("AED")).toBe("971");
    expect(dialCodeForCurrency("INR")).toBe("91");
    expect(dialCodeForCurrency("CHF")).toBe("41");
    expect(dialCodeForCurrency("kes")).toBe("254");
  });
  it("can't guess the country for USD / EUR / unknown", () => {
    expect(dialCodeForCurrency("USD")).toBeNull();
    expect(dialCodeForCurrency("EUR")).toBeNull();
    expect(dialCodeForCurrency("XYZ")).toBeNull();
    expect(dialCodeForCurrency(null)).toBeNull();
  });
});

describe("buildWhatsAppLink", () => {
  it("encodes the message: newlines, *bold*, currency symbols, non-ASCII", () => {
    const msg = "Hi Amina,\nRent: *KSh 93,000* — £1,800 · €50 ₹ 2 ✓\nAsante sana ñ";
    const url = buildWhatsAppLink("254712345678", msg);
    expect(url.startsWith("https://wa.me/254712345678?text=")).toBe(true);
    expect(url).toContain("%0A"); // newline
    expect(url).toContain("*KSh%2093%2C000*"); // asterisks stay, space + comma encoded
    expect(url).not.toMatch(/[\s£€₹✓ñ—]/); // nothing raw left
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(msg);
  });
  it("encodes characters that would break the query string", () => {
    const url = buildWhatsAppLink("447911123456", "a&b=c?d#e+f");
    expect(url).toBe("https://wa.me/447911123456?text=a%26b%3Dc%3Fd%23e%2Bf");
  });
});

describe("displayWhatsAppNumber", () => {
  it("splits off a known country code", () => {
    expect(displayWhatsAppNumber("254712345678")).toBe("+254 712345678");
    expect(displayWhatsAppNumber("447911123456")).toBe("+44 7911123456");
    expect(displayWhatsAppNumber("252612345678")).toBe("+252612345678");
  });
});
