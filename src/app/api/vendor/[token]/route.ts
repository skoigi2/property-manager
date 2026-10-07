import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendNotificationEmail, esc } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";
import { advanceCase, getWorkflow, getStageByKey } from "@/lib/case-workflows";
import { formatCurrency } from "@/lib/currency";
import { findQuoteByToken, quoteLinkView, submitQuoteByLink } from "@/lib/vendor-quote-link";

// Public vendor magic-link routes — the token IS the auth, mirroring
// /api/approvals/[token]. GET stays idempotent (link scanners consume nothing).
// Two kinds of token: a quote's own link (MaintenanceQuote.linkToken — several
// vendors per job, src/lib/vendor-quote-link.ts) and the job's older single
// vendor link (MaintenanceJob.vendorLinkToken), handled below.

function isExpired(d: Date | null): boolean {
  return !!d && d.getTime() < Date.now();
}

async function findByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.maintenanceJob.findUnique({
    where: { vendorLinkToken: token },
    include: {
      vendor: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      property: { select: { id: true, name: true, address: true, currency: true, organizationId: true, organization: { select: { name: true } } } },
      caseThread: { select: { id: true, currentStageIndex: true } },
    },
  });
}

export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const quote = await findQuoteByToken(params.token);
  if (quote) return NextResponse.json(quoteLinkView(quote));
  const job = await findByToken(params.token);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Replaced by per-vendor quote links once the job has any: shown as closed.
  const superseded = (await prisma.maintenanceQuote.count({ where: { jobId: job.id } })) > 0;

  return NextResponse.json({
    expired: isExpired(job.vendorLinkExpiresAt),
    closed: job.status === "DONE" || job.status === "CANCELLED" || superseded,
    vendorName: job.vendor?.name ?? "Contractor",
    orgName: job.property.organization?.name ?? job.property.name,
    title: job.title,
    description: job.description,
    category: job.category,
    priority: job.priority,
    isEmergency: job.isEmergency,
    propertyName: job.property.name,
    propertyAddress: job.property.address,
    unitNumber: job.unit?.unitNumber ?? null,
    currency: job.property.currency ?? "USD",
    existingQuote: job.vendorQuoteAmount !== null
      ? { amount: job.vendorQuoteAmount, note: job.vendorQuoteNote, at: job.vendorQuoteAt }
      : null,
    scheduledDate: job.scheduledDate,
  });
}

const quoteSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(2000).optional().nullable(),
  availableDate: z.string().optional().nullable(),
});

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const limited = rateLimit(`vendor-link:${getClientIp(req)}`, { max: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const quote = await findQuoteByToken(params.token);
  if (quote) {
    const parsedQuote = quoteSchema.safeParse(await req.json().catch(() => null));
    if (!parsedQuote.success) return NextResponse.json({ error: "Enter a valid quote amount." }, { status: 400 });
    const { amount, note, availableDate } = parsedQuote.data;
    const res = await submitQuoteByLink(quote, params.token, {
      amount: Math.round(amount * 100) / 100,
      note: note?.trim() || null,
      availableDate: availableDate && !isNaN(Date.parse(availableDate)) ? new Date(availableDate) : null,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, updated: res.updated });
  }

  const job = await findByToken(params.token);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Superseded by per-vendor quote links: the old single link no longer takes a price.
  if (await prisma.maintenanceQuote.count({ where: { jobId: job.id } })) {
    return NextResponse.json({ error: "This link has been replaced — please use the latest quote link you were sent." }, { status: 410 });
  }
  if (isExpired(job.vendorLinkExpiresAt)) {
    return NextResponse.json({ error: "This link has expired — ask for a new one." }, { status: 410 });
  }
  if (job.status === "DONE" || job.status === "CANCELLED") {
    return NextResponse.json({ error: "This job has been closed." }, { status: 410 });
  }

  const parsed = quoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid quote amount." }, { status: 400 });
  }
  const { amount, note, availableDate } = parsed.data;
  const isUpdate = job.vendorQuoteAmount !== null;
  const now = new Date();
  const visitDate = availableDate && !isNaN(Date.parse(availableDate)) ? new Date(availableDate) : null;

  await prisma.maintenanceJob.update({
    where: { id: job.id },
    data: {
      vendorQuoteAmount: amount,
      vendorQuoteNote: note || null,
      vendorQuoteAt: now,
      ...(visitDate ? { scheduledDate: visitDate } : {}),
    },
  });

  const currency = job.property.currency ?? "USD";
  const quoteLabel = formatCurrency(amount, currency);

  // Timeline event + auto-advance "Quote requested" -> "Quote received".
  if (job.caseThread) {
    await prisma.caseEvent.create({
      data: {
        caseThreadId: job.caseThread.id,
        kind: "EXTERNAL_UPDATE",
        actorName: job.vendor?.name ?? "Vendor",
        body: `${isUpdate ? "Updated quote" : "Quote"} submitted via vendor link: ${quoteLabel}${visitDate ? ` — available ${visitDate.toLocaleDateString("en-GB")}` : ""}${note ? `\n\n${note}` : ""}`,
        meta: { vendorQuoteAmount: amount, availableDate: visitDate?.toISOString() ?? null },
      },
    }).catch(() => {});

    try {
      const wf = getWorkflow("MAINTENANCE");
      const target = getStageByKey(wf, "quote_received");
      if (target && target.index > job.caseThread.currentStageIndex) {
        // Forward-only, and only the one hop this event evidences.
        const current = getStageByKey(wf, "quote_requested");
        if (current && job.caseThread.currentStageIndex <= current.index) {
          await advanceCase(job.caseThread.id, target.index, {
            actorName: "system",
            note: `Quote received from ${job.vendor?.name ?? "vendor"} (${quoteLabel})`,
          });
        }
      }
    } catch (e) {
      console.error("[vendor-link] case advance failed:", e);
    }
  }

  await logAudit({
    userId:     "system",
    userEmail:  "vendor-link",
    action:     "UPDATE",
    resource:   "MaintenanceJob",
    resourceId: job.id,
    after:      { vendorQuoteAmount: amount, vendorQuoteNote: note ?? null, scheduledDate: visitDate, token: redactToken(params.token) },
  });

  // Notify managers.
  const orgId = job.property.organizationId;
  if (orgId) {
    const { getPropertyManagers } = await import("@/lib/notifications/checkers");
    const managers = await getPropertyManagers(job.property.id, orgId).catch(() => []);
    for (const m of managers) {
      sendNotificationEmail(
        m.email,
        `${isUpdate ? "Updated quote" : "Quote"} received — ${job.title}`,
        `
          <p>${esc(job.vendor?.name ?? "The vendor")} submitted a quote of <strong>${esc(quoteLabel)}</strong>
          for "${esc(job.title)}" (${esc(job.property.name)}${job.unit ? `, Unit ${esc(job.unit.unitNumber)}` : ""}).</p>
          ${visitDate ? `<p>Available: <strong>${visitDate.toLocaleDateString("en-GB")}</strong></p>` : ""}
          ${note ? `<p>Note: ${esc(note)}</p>` : ""}
        `,
        { organizationId: orgId, caseThreadId: job.caseThreadId ?? null },
      ).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, updated: isUpdate });
}
