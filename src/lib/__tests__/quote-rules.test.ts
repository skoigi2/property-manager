import { describe, it, expect } from "vitest";
import {
  decideQuoteAction, vendorLinkState, restoredStatus, needsOwnerApproval, lowestQuote, quoteCounts, type QuoteRef,
} from "@/lib/quote-rules";

const q = (over: Partial<QuoteRef> = {}): QuoteRef => ({ status: "REQUESTED", amount: null, linkExpiresAt: null, ...over });
const open = { status: "OPEN" };
const staff = { isManager: false };
const manager = { isManager: true };

describe("decideQuoteAction", () => {
  it("lets staff type in a quote, rounding to cents and needing a positive amount", () => {
    expect(decideQuoteAction("record", q(), open, [], staff, { amount: "4500.456", note: " Paint + labour " }))
      .toEqual({ ok: true, amount: 4500.46, note: "Paint + labour" });
    expect(decideQuoteAction("record", q(), open, [], staff, { amount: "0" })).toMatchObject({ ok: false, status: 400 });
    expect(decideQuoteAction("record", q(), open, [], staff, { amount: "abc" })).toMatchObject({ ok: false, status: 400 });
    expect(decideQuoteAction("record", q({ status: "ACCEPTED", amount: 10 }), open, [], staff, { amount: 5 })).toMatchObject({ ok: false, status: 409 });
  });

  it("keeps accept, decline and undo for managers", () => {
    for (const a of ["accept", "decline", "unaccept"] as const) {
      expect(decideQuoteAction(a, q({ status: "RECEIVED", amount: 10 }), open, [], staff, {})).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("accepts only a received quote, and only one per job", () => {
    expect(decideQuoteAction("accept", q({ status: "RECEIVED", amount: 10 }), open, [q()], manager, {})).toEqual({ ok: true });
    expect(decideQuoteAction("accept", q(), open, [], manager, {})).toMatchObject({ ok: false, status: 409 });
    expect(decideQuoteAction("accept", q({ status: "RECEIVED", amount: 10 }), open, [q({ status: "ACCEPTED", amount: 9 })], manager, {}))
      .toMatchObject({ ok: false, status: 409 });
  });

  it("declines an undecided quote with an optional reason; never an accepted one", () => {
    expect(decideQuoteAction("decline", q({ status: "RECEIVED", amount: 10 }), open, [], manager, { reason: " Too dear " })).toEqual({ ok: true, reason: "Too dear" });
    expect(decideQuoteAction("decline", q(), open, [], manager, {})).toEqual({ ok: true, reason: null });
    expect(decideQuoteAction("decline", q({ status: "ACCEPTED", amount: 1 }), open, [], manager, {})).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses everything but undo on a closed job", () => {
    expect(decideQuoteAction("record", q(), { status: "DONE" }, [], staff, { amount: 5 })).toMatchObject({ ok: false, status: 409 });
    expect(decideQuoteAction("resend", q(), { status: "CANCELLED" }, [], staff, {})).toMatchObject({ ok: false, status: 409 });
    expect(decideQuoteAction("unaccept", q({ status: "ACCEPTED", amount: 5 }), { status: "DONE" }, [], manager, {})).toEqual({ ok: true });
  });
});

describe("vendorLinkState", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("is open until expiry, decision or the job closing", () => {
    expect(vendorLinkState(q({ linkExpiresAt: "2026-10-10T00:00:00Z" }), open, now)).toBe("open");
    expect(vendorLinkState(q({ linkExpiresAt: "2026-10-01T00:00:00Z" }), open, now)).toBe("expired");
    expect(vendorLinkState(q({ status: "ACCEPTED", amount: 1 }), open, now)).toBe("decided");
    expect(vendorLinkState(q(), { status: "DONE" }, now)).toBe("closed");
  });
});

describe("helpers", () => {
  it("restores an auto-declined quote to where it was", () => {
    expect(restoredStatus({ amount: 50 })).toBe("RECEIVED");
    expect(restoredStatus({ amount: null })).toBe("REQUESTED");
  });
  it("flags quotes above the repair authority limit", () => {
    expect(needsOwnerApproval(12000, 10000)).toBe(true);
    expect(needsOwnerApproval(8000, 10000)).toBe(false);
    expect(needsOwnerApproval(12000, null)).toBe(false);
    expect(needsOwnerApproval(12000, 0)).toBe(false);
    expect(needsOwnerApproval(null, 10000)).toBe(false);
  });
  it("finds the lowest received or accepted quote and counts them", () => {
    const list = [q({ status: "RECEIVED", amount: 9000 }), q({ status: "RECEIVED", amount: 7000 }), q({ status: "DECLINED", amount: 5000 }), q()];
    expect(lowestQuote(list)?.amount).toBe(7000);
    expect(lowestQuote([q()])).toBeNull();
    expect(quoteCounts(list)).toMatchObject({ total: 4, received: 2, accepted: null });
  });
});
