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

  switch (action) {
    case "record": {
      const available = input.availableDate && !Number.isNaN(Date.parse(input.availableDate)) ? new Date(input.availableDate) : null;
      await prisma.maintenanceQuote.update({
        where: { id: quote.id },
        data: { status: "RECEIVED", amount: decision.amount, note: decision.note ?? null, availableDate: available, receivedAt: now, receivedVia: actorName },
      });
      await caseNote(job, actorName, `Quote from ${quote.vendor.name} recorded: ${formatCurrency(decision.amount!, currency)}.`, "quote_received");
      break;
    }
    case "resend": {
      const link = newQuoteLink();
      await prisma.maintenanceQuote.update({ where: { id: quote.id }, data: link });
      const url = quoteLinkUrl(link.linkToken);
      extra = { url, emailed: await emailQuoteRequest(job, quote.vendor, url, null) };
      break;
    }
    case "accept": {
      const others = job.quotes.filter((q) => q.id !== quote.id && (q.status === "REQUESTED" || q.status === "RECEIVED"));
      await prisma.$transaction([
        prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", decidedAt: now, decidedByName: actorName } }),
        prisma.maintenanceQuote.updateMany({
          where: { id: { in: others.map((o) => o.id) } },
          data: { status: "DECLINED", autoDeclined: true, declineReason: "Another quote was accepted", decidedAt: now, decidedByName: actorName },
        }),
        prisma.maintenanceJob.update({
          where: { id: job.id },
          data: {
            vendorId: quote.vendorId,
            vendorQuoteAmount: quote.amount,
            vendorQuoteNote: quote.note,
            vendorQuoteAt: quote.receivedAt ?? now,
            ...(quote.availableDate && !job.scheduledDate ? { scheduledDate: quote.availableDate } : {}),
          },
        }),
      ]);
      await caseNote(job, actorName, `Accepted ${quote.vendor.name}'s quote of ${formatCurrency(quote.amount ?? 0, currency)}${others.length ? `; ${others.length} other quote${others.length === 1 ? "" : "s"} declined` : ""}.`, "approved");
      extra = { vendorEmailed: await emailQuoteAccepted(job, quote) };
      break;
    }
    case "decline":
      await prisma.maintenanceQuote.update({
        where: { id: quote.id },
        data: { status: "DECLINED", autoDeclined: false, declineReason: decision.reason ?? null, decidedAt: now, decidedByName: actorName },
      });
      await caseNote(job, actorName, `Declined ${quote.vendor.name}'s quote${decision.reason ? `: ${decision.reason}` : "."}`);
      break;
    case "unaccept": {
      const restored = job.quotes.filter((q) => q.status === "DECLINED" && q.autoDeclined);
      await prisma.$transaction([
        prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { status: "RECEIVED", decidedAt: null, decidedByName: null } }),
        ...restored.map((q) => prisma.maintenanceQuote.update({
          where: { id: q.id },
          data: { status: restoredStatus(q), autoDeclined: false, declineReason: null, decidedAt: null, decidedByName: null },
        })),
        ...(job.vendorId === quote.vendorId ? [prisma.maintenanceJob.update({ where: { id: job.id }, data: { vendorQuoteAmount: null, vendorQuoteNote: null, vendorQuoteAt: null } })] : []),
      ]);
      await caseNote(job, actorName, `Undid the acceptance of ${quote.vendor.name}'s quote.`);
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
    before: { status: quote.status, amount: quote.amount },
    after: { action, ...(decision.amount !== undefined ? { amount: decision.amount } : {}), ...(decision.reason ? { reason: decision.reason } : {}) },
  });

  const reloaded = await loadQuoteJob(job.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json({ ...extra, ...(await serializeQuotes(reloaded.job, session!)) });
}
