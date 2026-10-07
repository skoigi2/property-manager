import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { quoteActionSchema } from "@/lib/validations";
import { isInspectionManager } from "@/lib/inspections";
import { formatCurrency } from "@/lib/currency";
import { decideQuoteAction, restoredStatus, type QuoteStatus } from "@/lib/quote-rules";
import { caseNote, emailQuoteAccepted, emailQuoteRequest, loadQuoteJob, newQuoteLink, quoteLinkUrl, serializeQuotes } from "@/lib/quotes";

// One quote: record an amount received by phone / WhatsApp, re-send the link
// (ops staff incl. CARETAKER); accept, decline or undo an acceptance
// (managers). Rules: src/lib/quote-rules.ts.
export async function POST(req: Request, props: { params: Promise<{ id: string; quoteId: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadQuoteJob(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const job = loaded.job;
  const quote = job.quotes.find((q) => q.id === params.quoteId);
  if (!quote) return Response.json({ error: "Quote not found" }, { status: 404 });

  const parsed = quoteActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { action, ...input } = parsed.data;
  const ref = (q: typeof quote) => ({ status: q.status as QuoteStatus, amount: q.amount, linkExpiresAt: q.linkExpiresAt, autoDeclined: q.autoDeclined });
  const decision = decideQuoteAction(
    action, ref(quote), job, job.quotes.filter((q) => q.id !== quote.id).map(ref),
    { isManager: isInspectionManager(session!) }, input,
  );
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });

  const actorName = session!.user.name ?? session!.user.email ?? "Staff";
  const currency = job.property.currency ?? "KES";
  const now = new Date();
  let extra: Record<string, unknown> = {};
  // What accepting put on the job, so an undo can put the job back exactly.
  type JobBefore = { vendorId: string | null; scheduledDate: string | null; vendorQuoteAmount: number | null; vendorQuoteNote: string | null; vendorQuoteAt: string | null };
  let acceptedOver: JobBefore | null = null;

  // Every write is conditional on the quote still being in the state the
  // decision saw — a vendor submitting, or another manager deciding, at the same
  // moment gets a 409 instead of silently overwriting.
  const conflict = () => Response.json({ error: "This quote just changed — refresh and try again.", code: "CONFLICT" }, { status: 409 });
  const UNDECIDED = ["REQUESTED", "RECEIVED"] as ("REQUESTED" | "RECEIVED")[];

  switch (action) {
    case "record": {
      const available = input.availableDate && !Number.isNaN(Date.parse(input.availableDate)) ? new Date(input.availableDate) : null;
      const res = await prisma.maintenanceQuote.updateMany({
        where: { id: quote.id, status: { in: UNDECIDED } },
        data: { status: "RECEIVED", amount: decision.amount, note: decision.note ?? null, availableDate: available, receivedAt: now, receivedVia: actorName },
      });
      if (res.count === 0) return conflict();
      await caseNote(job, actorName, `Quote from ${quote.vendor.name} recorded: ${formatCurrency(decision.amount!, currency)}.`, "quote_received");
      break;
    }
    case "resend": {
      const link = newQuoteLink();
      const res = await prisma.maintenanceQuote.updateMany({ where: { id: quote.id, status: { in: UNDECIDED } }, data: link });
      if (res.count === 0) return conflict();
      const url = quoteLinkUrl(link.linkToken);
      extra = { url, emailed: await emailQuoteRequest(job, quote.vendor, url, null) };
      break;
    }
    case "accept": {
      if (input.expectedAmount !== undefined && Math.abs((input.expectedAmount ?? 0) - (quote.amount ?? 0)) > 0.005) {
        return Response.json({ error: `${quote.vendor.name} has changed the price to ${formatCurrency(quote.amount ?? 0, currency)} — check it before accepting.`, code: "PRICE_CHANGED" }, { status: 409 });
      }
      // Only the price the manager saw: a vendor re-submitting through their
      // link a moment ago changes amount / receivedAt, and this refuses.
      const res = await prisma.maintenanceQuote.updateMany({
        where: { id: quote.id, status: "RECEIVED", amount: quote.amount, receivedAt: quote.receivedAt },
        data: { status: "ACCEPTED", decidedAt: now, decidedByName: actorName },
      });
      if (res.count === 0) return Response.json({ error: "This quote just changed — refresh to see the latest price.", code: "CONFLICT" }, { status: 409 });
      // Two managers accepting different quotes at once: only one may stand.
      const acceptedNow = await prisma.maintenanceQuote.count({ where: { jobId: job.id, status: "ACCEPTED" } });
      if (acceptedNow > 1) {
        await prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { status: "RECEIVED", decidedAt: null, decidedByName: null } });
        return Response.json({ error: "Another quote was just accepted — refresh to see it.", code: "CONFLICT" }, { status: 409 });
      }
      const before = await prisma.maintenanceJob.findUniqueOrThrow({
        where: { id: job.id },
        select: { vendorId: true, scheduledDate: true, vendorQuoteAmount: true, vendorQuoteNote: true, vendorQuoteAt: true },
      });
      acceptedOver = {
        vendorId: before.vendorId,
        scheduledDate: before.scheduledDate?.toISOString() ?? null,
        vendorQuoteAmount: before.vendorQuoteAmount ?? null,
        vendorQuoteNote: before.vendorQuoteNote ?? null,
        vendorQuoteAt: before.vendorQuoteAt?.toISOString() ?? null,
      };
      // The rest of the acceptance commits together (array form — pgBouncer).
      let declined: { count: number };
      try {
        [declined] = await prisma.$transaction([
          prisma.maintenanceQuote.updateMany({
            where: { jobId: job.id, id: { not: quote.id }, status: { in: UNDECIDED } },
            data: { status: "DECLINED", autoDeclined: true, declineReason: "Another quote was accepted", decidedAt: now, decidedByName: actorName },
          }),
          prisma.maintenanceJob.update({
            where: { id: job.id },
            data: {
              vendorId: quote.vendorId,
              vendorQuoteAmount: quote.amount,
              vendorQuoteNote: quote.note,
              vendorQuoteAt: quote.receivedAt ?? now,
              ...(quote.availableDate && !before.scheduledDate ? { scheduledDate: quote.availableDate } : {}),
              // The job's older single vendor link must not overwrite the accepted price.
              vendorLinkToken: null,
              vendorLinkExpiresAt: null,
            },
          }),
        ]);
      } catch (e) {
        await prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { status: "RECEIVED", decidedAt: null, decidedByName: null } });
        throw e;
      }
      await caseNote(job, actorName, `Accepted ${quote.vendor.name}'s quote of ${formatCurrency(quote.amount ?? 0, currency)}${declined.count ? `; ${declined.count} other quote${declined.count === 1 ? "" : "s"} declined` : ""}.`, "approved");
      extra = { vendorEmailed: await emailQuoteAccepted(job, quote) };
      break;
    }
    case "decline": {
      const res = await prisma.maintenanceQuote.updateMany({
        where: { id: quote.id, status: { in: UNDECIDED } },
        data: { status: "DECLINED", autoDeclined: false, declineReason: decision.reason ?? null, decidedAt: now, decidedByName: actorName },
      });
      if (res.count === 0) return conflict();
      await caseNote(job, actorName, `Declined ${quote.vendor.name}'s quote${decision.reason ? `: ${decision.reason}` : "."}`);
      break;
    }
    case "unaccept": {
      const res = await prisma.maintenanceQuote.updateMany({
        where: { id: quote.id, status: "ACCEPTED" },
        data: { status: "RECEIVED", decidedAt: null, decidedByName: null },
      });
      if (res.count === 0) return conflict();
      const restored = await prisma.maintenanceQuote.findMany({ where: { jobId: job.id, status: "DECLINED", autoDeclined: true }, select: { id: true, amount: true } });
      for (const q of restored) {
        await prisma.maintenanceQuote.updateMany({
          where: { id: q.id, status: "DECLINED", autoDeclined: true },
          data: { status: restoredStatus(q), autoDeclined: false, declineReason: null, decidedAt: null, decidedByName: null },
        });
      }
      // Put the job back as it was before accepting (recorded on the accept's
      // audit row) — unless someone has changed the vendor since.
      const acceptRow = await prisma.auditLog.findFirst({
        where: { resource: "MaintenanceQuote", resourceId: quote.id, after: { path: ["action"], equals: "accept" } },
        orderBy: { createdAt: "desc" },
        select: { before: true },
      });
      const prev = (acceptRow?.before as { jobBefore?: JobBefore } | null)?.jobBefore;
      const fresh = await prisma.maintenanceJob.findUnique({ where: { id: job.id }, select: { vendorId: true, scheduledDate: true } });
      let stillAssigned = false;
      if (fresh?.vendorId === quote.vendorId) {
        const setByAccept = quote.availableDate && fresh.scheduledDate?.getTime() === quote.availableDate.getTime() && !prev?.scheduledDate;
        await prisma.maintenanceJob.update({
          where: { id: job.id },
          data: prev
            ? {
                vendorId: prev.vendorId,
                vendorQuoteAmount: prev.vendorQuoteAmount,
                vendorQuoteNote: prev.vendorQuoteNote,
                vendorQuoteAt: prev.vendorQuoteAt ? new Date(prev.vendorQuoteAt) : null,
                ...(setByAccept ? { scheduledDate: null } : {}),
              }
            : {
                // No record of the earlier state (accepted before this was kept): clear what accepting sets.
                vendorId: null, vendorQuoteAmount: null, vendorQuoteNote: null, vendorQuoteAt: null,
                ...(quote.availableDate && fresh.scheduledDate?.getTime() === quote.availableDate.getTime() ? { scheduledDate: null } : {}),
              },
        });
        stillAssigned = prev?.vendorId === quote.vendorId;
      }
      await caseNote(job, actorName, stillAssigned
        ? `Undid the acceptance of ${quote.vendor.name}'s quote (${quote.vendor.name} stays assigned, as before).`
        : `Undid the acceptance of ${quote.vendor.name}'s quote — ${quote.vendor.name} is no longer assigned to the job.`);
      break;
    }
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "MaintenanceQuote",
    resourceId: quote.id,
    organizationId: job.property.organizationId,
    before: { status: quote.status, amount: quote.amount, ...(acceptedOver ? { jobBefore: acceptedOver } : {}) },
    after: { action, ...(decision.amount !== undefined ? { amount: decision.amount } : {}), ...(decision.reason ? { reason: decision.reason } : {}) },
  });

  const reloaded = await loadQuoteJob(job.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json({ ...extra, ...(await serializeQuotes(reloaded.job, session!)) });
}
