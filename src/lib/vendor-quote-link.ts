import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";
import { formatCurrency } from "@/lib/currency";
import { vendorLinkState, type QuoteStatus } from "@/lib/quote-rules";
import { caseNote, loadQuoteJobUnchecked, notifyQuoteReceived } from "@/lib/quotes";

// The vendor's side of a quote link (/vendor/[token]) — public, the token is
// the auth. Used by /api/vendor/[token] for per-quote links; the job's older
// single vendor link is handled there directly.

export async function findQuoteByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.maintenanceQuote.findUnique({
    where: { linkToken: token },
    select: {
      id: true, jobId: true, status: true, amount: true, note: true, availableDate: true, linkExpiresAt: true,
      documentName: true, receivedAt: true,
      vendor: { select: { name: true } },
      job: {
        select: {
          status: true, title: true, description: true, category: true, priority: true, isEmergency: true, scheduledDate: true,
          unit: { select: { unitNumber: true } },
          property: { select: { name: true, address: true, currency: true, organization: { select: { name: true } } } },
        },
      },
    },
  });
}
export type QuoteByToken = NonNullable<Awaited<ReturnType<typeof findQuoteByToken>>>;

const stateOf = (q: QuoteByToken) => vendorLinkState({ status: q.status as QuoteStatus, amount: q.amount, linkExpiresAt: q.linkExpiresAt }, q.job);

/** GET payload — same shape the vendor page already reads, plus what a quote link adds. */
export function quoteLinkView(q: QuoteByToken) {
  const state = stateOf(q);
  return {
    kind: "quote" as const,
    expired: state === "expired",
    closed: state === "closed" || state === "decided",
    decided: state === "decided" ? (q.status as QuoteStatus) : null,
    vendorName: q.vendor.name,
    orgName: q.job.property.organization?.name ?? q.job.property.name,
    title: q.job.title,
    description: q.job.description,
    category: q.job.category,
    priority: q.job.priority,
    isEmergency: q.job.isEmergency,
    propertyName: q.job.property.name,
    propertyAddress: q.job.property.address,
    unitNumber: q.job.unit?.unitNumber ?? null,
    currency: q.job.property.currency ?? "KES",
    existingQuote: q.amount !== null ? { amount: q.amount, note: q.note, at: q.receivedAt } : null,
    scheduledDate: q.availableDate ?? q.job.scheduledDate,
    canAttach: true,
    documentName: q.documentName,
  };
}

/** The vendor submits (or updates) their price. */
export async function submitQuoteByLink(
  q: QuoteByToken,
  token: string,
  input: { amount: number; note: string | null; availableDate: Date | null },
): Promise<{ ok: true; updated: boolean } | { ok: false; status: number; error: string }> {
  const state = stateOf(q);
  if (state === "expired") return { ok: false, status: 410, error: "This link has expired — ask for a new one." };
  if (state === "closed") return { ok: false, status: 410, error: "This job has been closed." };
  if (state === "decided") return { ok: false, status: 410, error: "A decision has already been made on this quote." };

  const isUpdate = q.amount !== null;
  // Only while still undecided — a manager may have accepted another quote a
  // moment ago, which auto-declined this one.
  const res = await prisma.maintenanceQuote.updateMany({
    where: { id: q.id, status: { in: ["REQUESTED", "RECEIVED"] } },
    data: { status: "RECEIVED", amount: input.amount, note: input.note, availableDate: input.availableDate, receivedAt: new Date(), receivedVia: "Vendor" },
  });
  if (res.count === 0) return { ok: false, status: 410, error: "A decision has already been made on this quote." };
  await logAudit({
    userId: "system",
    userEmail: "vendor-link",
    action: "UPDATE",
    resource: "MaintenanceQuote",
    resourceId: q.id,
    after: { amount: input.amount, note: input.note, availableDate: input.availableDate, token: redactToken(token) },
  });

  const job = await loadQuoteJobUnchecked(q.jobId);
  if (job) {
    const quote = job.quotes.find((x) => x.id === q.id)!;
    await caseNote(job, q.vendor.name,
      `${isUpdate ? "Updated quote" : "Quote"} from ${q.vendor.name} via their link: ${formatCurrency(input.amount, job.property.currency ?? "KES")}${input.availableDate ? ` — available ${input.availableDate.toLocaleDateString("en-GB")}` : ""}.`,
      "quote_received");
    await notifyQuoteReceived(job, quote, input.amount, isUpdate);
  }
  return { ok: true, updated: isUpdate };
}

/** Whether the vendor may still attach a document. */
export function canAttachByLink(q: QuoteByToken): boolean {
  return stateOf(q) === "open";
}
