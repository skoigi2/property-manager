/**
 * WhatsApp click-to-chat (https://wa.me/<digits>?text=…) — client-safe, pure.
 * The manager's own WhatsApp opens with the message pre-filled and they press
 * send: no WhatsApp Business API, no Meta account, no cost, and no delivery
 * confirmation (we log the send attempt only).
 */

/** Country dial code per property currency — the fallback for numbers written without one. */
const DIAL_CODES: Record<string, string> = {
  KES: "254",
  TZS: "255",
  UGX: "256",
  ZAR: "27",
  GBP: "44",
  AED: "971",
  INR: "91",
  CHF: "41",
  BHD: "973",
};

/** Dial code for a property currency; null where the currency doesn't name one country (USD, EUR, …). */
export function dialCodeForCurrency(currency: string | null | undefined): string | null {
  return (currency && DIAL_CODES[currency.toUpperCase()]) || null;
}

/**
 * A phone number as WhatsApp wants it — digits only, country code first — or
 * null when it can't be made into one.
 *
 * - Spaces, dashes, dots, slashes and brackets are dropped; a leading "+" or
 *   "00" marks the number as already international.
 * - A single leading 0 is the national trunk prefix ("0712 345 678"): it is
 *   replaced by `fallbackDialCode`, and without one the number is rejected —
 *   we can't guess the country.
 * - A short number with neither ("712345678", ≤ 10 digits) has lost its
 *   country code — typically Excel dropping the leading 0 — and is treated
 *   the same way. Longer bare numbers ("254712345678") already carry one.
 * - Fewer than 8 or more than 15 digits (E.164's limit) is rejected.
 */
export function normalizePhoneForWhatsApp(
  raw: string | number | null | undefined,
  fallbackDialCode?: string | null,
): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Anything beyond digits and separators (letters, "ext", "#", …) is not a phone number.
  if (/[^\d\s\-().\/+]/.test(s)) return null;
  s = s.replace(/[\s\-().\/]/g, "");

  let international = false;
  if (s.startsWith("+")) {
    s = s.slice(1);
    international = true;
  } else if (s.startsWith("00")) {
    s = s.slice(2);
    international = true;
  }
  if (!/^\d+$/.test(s)) return null; // a "+" anywhere else

  if (!international) {
    const trunk = /^0[1-9]/.test(s);
    const missingCode = !trunk && s.length <= 10;
    if (trunk || missingCode) {
      if (!fallbackDialCode) return null;
      s = fallbackDialCode + (trunk ? s.slice(1) : s);
    }
  }

  if (s.length < 8 || s.length > 15) return null;
  return s;
}

/** The click-to-chat URL for a normalised number and a plain-text message. */
export function buildWhatsAppLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

/** "+254 712345678"-style display for a normalised number (country code split off when known). */
export function displayWhatsAppNumber(phoneDigits: string): string {
  const code = Object.values(DIAL_CODES)
    .sort((a, b) => b.length - a.length)
    .find((c) => phoneDigits.startsWith(c));
  return code ? `+${code} ${phoneDigits.slice(code.length)}` : `+${phoneDigits}`;
}
