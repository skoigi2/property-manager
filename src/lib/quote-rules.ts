// Pure rules for vendor quotes on maintenance jobs (Phase 4 of caretaker
// check-in / check-out). No Prisma here — see src/lib/quotes.ts.
//
// A job can have several quotes, one per vendor, each with its own link.
// Staff (caretakers incl.) request quotes and type in ones they receive by
// phone or WhatsApp; only a manager accepts or declines (owner decision
// 2026-10-06). Accepting one assigns its vendor to the job and declines the
// others automatically; undoing it restores them.

export type QuoteStatus = "REQUESTED" | "RECEIVED" | "ACCEPTED" | "DECLINED";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  REQUESTED: "Waiting for quote",
  RECEIVED: "Quote received",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

/** Days a quote link stays open. */
export const QUOTE_LINK_DAYS = 14;

export type QuoteRef = {
  status: QuoteStatus;
  amount: number | null;
  linkExpiresAt: Date | string | null;
  autoDeclined?: boolean;
};

export type JobRef = { status: string };

const jobOpen = (j: JobRef) => j.status !== "DONE" && j.status !== "CANCELLED";

export type QuoteAction = "record" | "accept" | "decline" | "unaccept" | "resend";

export type QuoteDecision =
  | { ok: true; amount?: number; note?: string | null; reason?: string | null }
  | { ok: false; status: number; error: string };

const no = (status: number, error: string): QuoteDecision => ({ ok: false, status, error });

export function decideQuoteAction(
  action: QuoteAction,
  quote: QuoteRef,
  job: JobRef,
  others: QuoteRef[],
  actor: { isManager: boolean },
  input: { amount?: unknown; note?: string | null; reason?: string | null },
): QuoteDecision {
  if ((action === "accept" || action === "decline" || action === "unaccept") && !actor.isManager) {
    return no(403, "Only a manager can accept or decline a quote.");
  }
  if (!jobOpen(job) && action !== "unaccept") return no(409, "This job is closed.");
  switch (action) {
    case "record": {
      if (quote.status === "ACCEPTED" || quote.status === "DECLINED") return no(409, "This quote has already been decided.");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return no(400, "Enter the quoted amount.");
      return { ok: true, amount: Math.round(amount * 100) / 100, note: input.note?.trim().slice(0, 2000) || null };
    }
    case "resend":
      if (quote.status === "ACCEPTED" || quote.status === "DECLINED") return no(409, "This quote has already been decided.");
      return { ok: true };
    case "accept":
      if (quote.status !== "RECEIVED") return no(409, quote.status === "REQUESTED" ? "Wait for the amount, or type it in first." : "Only a received quote can be accepted.");
      if (others.some((o) => o.status === "ACCEPTED")) return no(409, "Another quote is already accepted — undo that first.");
      return { ok: true };
    case "decline":
      if (quote.status === "ACCEPTED") return no(409, "Undo the acceptance first.");
      if (quote.status === "DECLINED") return no(409, "Already declined.");
      return { ok: true, reason: input.reason?.trim().slice(0, 500) || null };
    case "unaccept":
      if (quote.status !== "ACCEPTED") return no(409, "This quote isn't accepted.");
      return { ok: true };
  }
}

/** The vendor's link: open while the quote is undecided, the job open and the link unexpired. */
export function vendorLinkState(quote: QuoteRef, job: JobRef, now: Date = new Date()): "open" | "expired" | "closed" | "decided" {
  if (!jobOpen(job)) return "closed";
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") return "decided";
  if (quote.linkExpiresAt && new Date(quote.linkExpiresAt).getTime() < now.getTime()) return "expired";
  return "open";
}

/** Status a quote returns to when an acceptance is undone (auto-declined ones only). */
export function restoredStatus(q: { amount: number | null }): QuoteStatus {
  return q.amount !== null ? "RECEIVED" : "REQUESTED";
}

/** Above the property's repair authority limit — the owner should approve first. */
export function needsOwnerApproval(amount: number | null, repairAuthorityLimit: number | null | undefined): boolean {
  return amount !== null && repairAuthorityLimit != null && repairAuthorityLimit > 0 && amount > repairAuthorityLimit;
}

/** The lowest received (or accepted) quote, for the comparison. */
export function lowestQuote<T extends { status: QuoteStatus; amount: number | null }>(quotes: T[]): T | null {
  const priced = quotes.filter((q) => q.amount !== null && (q.status === "RECEIVED" || q.status === "ACCEPTED"));
  return priced.reduce<T | null>((best, q) => (best === null || q.amount! < best.amount! ? q : best), null);
}

/** One-line summary for a job: "2 of 3 quotes in · lowest …" — amounts formatted by the caller. */
export function quoteCounts(quotes: QuoteRef[]): { total: number; received: number; accepted: QuoteRef | null } {
  return {
    total: quotes.length,
    received: quotes.filter((q) => q.status === "RECEIVED" || q.status === "ACCEPTED").length,
    accepted: quotes.find((q) => q.status === "ACCEPTED") ?? null,
  };
}
