import "server-only";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/auth-utils";
import { getSignedUrl } from "@/lib/supabase-storage";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { isAutomationEnabled, wantsEmail } from "@/lib/automation-registry";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { advanceCase, getWorkflow, getStageByKey } from "@/lib/case-workflows";
import { isInspectionManager, fail, type ServiceError } from "@/lib/inspections";
import { needsOwnerApproval, vendorLinkState, QUOTE_LINK_DAYS, type QuoteStatus } from "@/lib/quote-rules";

// Server side of vendor quotes on maintenance jobs. Pure rules:
// src/lib/quote-rules.ts. The vendor's page is /vendor/[token] (public, the
// token is the auth) — see src/app/api/vendor/[token].

const QUOTE_SELECT = {
  id: true, jobId: true, vendorId: true, status: true, linkToken: true, linkExpiresAt: true,
  amount: true, note: true, availableDate: true, documentPath: true, documentName: true, documentMime: true,
  requestedByUserId: true, requestedByName: true, requestedAt: true, receivedAt: true, receivedVia: true,
  decidedAt: true, decidedByName: true, declineReason: true, autoDeclined: true,
  vendor: { select: { id: true, name: true, phone: true, email: true, category: true } },
} as const;

const findJob = (id: string) =>
  prisma.maintenanceJob.findUnique({
    where: { id },
    include: {
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true } },
      property: {
        select: {
          id: true, name: true, currency: true, organizationId: true,
          organization: { select: { name: true } },
          agreement: { select: { repairAuthorityLimit: true } },
        },
      },
      quotes: { select: QUOTE_SELECT, orderBy: { requestedAt: "asc" } },
    },
  });
export type QuoteJob = NonNullable<Awaited<ReturnType<typeof findJob>>>;
export type QuoteRow = QuoteJob["quotes"][number];

/** A job the session may see (404 otherwise). */
export async function loadQuoteJob(jobId: string): Promise<{ ok: true; job: QuoteJob } | ServiceError> {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return fail(401, "Unauthorized");
  const job = await findJob(jobId);
  if (!job || !propertyIds.includes(job.propertyId)) return fail(404, "Job not found");
  return { ok: true, job };
}

/** No access check — only for the vendor's token link, where the token is the auth. */
export async function loadQuoteJobUnchecked(jobId: string): Promise<QuoteJob | null> {
  return findJob(jobId);
}

export function quoteLinkUrl(token: string): string {
  const origin = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  return `${origin}/vendor/${token}`;
}

export function newQuoteLink() {
  return { linkToken: randomUUID(), linkExpiresAt: new Date(Date.now() + QUOTE_LINK_DAYS * 86_400_000) };
}

/** The job's quotes as the panel shows them. */
export async function serializeQuotes(job: QuoteJob, session: Session) {
  const limit = job.property.agreement?.repairAuthorityLimit ?? null;
  const quotes = await Promise.all(job.quotes.map(async (q) => {
    const state = vendorLinkState({ status: q.status as QuoteStatus, amount: q.amount, linkExpiresAt: q.linkExpiresAt }, job);
    let documentUrl: string | null = null;
    if (q.documentPath) { try { documentUrl = await getSignedUrl(q.documentPath); } catch { documentUrl = null; } }
    return {
      id: q.id,
      status: q.status as QuoteStatus,
      vendor: { id: q.vendor.id, name: q.vendor.name, phone: q.vendor.phone, category: q.vendor.category, hasEmail: !!q.vendor.email },
      amount: q.amount,
      note: q.note,
      availableDate: q.availableDate,
      document: q.documentPath ? { name: q.documentName ?? "Quote", mime: q.documentMime, url: documentUrl } : null,
      requestedByName: q.requestedByName,
      requestedAt: q.requestedAt,
      receivedAt: q.receivedAt,
      receivedVia: q.receivedVia,
      decidedAt: q.decidedAt,
      decidedByName: q.decidedByName,
      declineReason: q.declineReason,
      linkState: state,
      linkUrl: state === "open" && q.linkToken ? quoteLinkUrl(q.linkToken) : null,
      linkExpiresAt: q.linkExpiresAt,
      needsOwnerApproval: needsOwnerApproval(q.amount, limit),
    };
  }));
  return {
    jobId: job.id,
    jobStatus: job.status,
    jobTitle: job.title,
    currency: job.property.currency ?? "KES",
    repairAuthorityLimit: limit,
    propertyName: job.property.name,
    unitNumber: job.unit?.unitNumber ?? null,
    quotes,
    viewer: { isManager: isInspectionManager(session) },
  };
}

/** Emails the vendor their quote link (when they have an address). Never throws. */
export async function emailQuoteRequest(job: QuoteJob, vendor: { name: string; email: string | null }, url: string, message: string | null): Promise<boolean> {
  const to = vendor.email?.trim();
  if (!to) return false;
  const sender = job.property.organization?.name ?? job.property.name;
  try {
    await sendNotificationEmail(
      to,
      `Quote request — ${job.title} (${job.property.name})`,
      `
        <p>Dear ${esc(vendor.name)},</p>
        <p>${esc(sender)} would like a quote for this job:</p>
        <p><strong>${esc(job.title)}</strong><br/>
        ${esc(job.property.name)}${job.unit ? ` — Unit ${esc(job.unit.unitNumber)}` : ""}</p>
        ${job.description ? `<p>${esc(job.description)}</p>` : ""}
        ${message ? `<p>${esc(message)}</p>` : ""}
        <p>Send your price, when you can come and, if you like, a quote document here — no login needed:</p>
        <p><a href="${url}">${url}</a></p>
        <p>This link expires in ${QUOTE_LINK_DAYS} days.</p>
      `,
      { organizationId: job.property.organizationId ?? null, caseThreadId: job.caseThreadId ?? null },
    );
    return true;
  } catch {
    return false;
  }
}

/** "Quote received" → the property's managers and whoever requested it (NOTIFY_QUOTES). Never throws. */
export async function notifyQuoteReceived(job: QuoteJob, quote: QuoteRow, amount: number, isUpdate: boolean): Promise<void> {
  try {
    const orgId = job.property.organizationId;
    if (!orgId || !(await isAutomationEnabled(orgId, "NOTIFY_QUOTES", job.propertyId))) return;
    const label = formatCurrency(amount, job.property.currency ?? "KES");
    const subject = `${isUpdate ? "Updated quote" : "Quote"} from ${quote.vendor.name} — ${job.title}`;
    const html = `
      <p>${esc(quote.vendor.name)} quoted <strong>${esc(label)}</strong> for "${esc(job.title)}"
      (${esc(job.property.name)}${job.unit ? `, Unit ${esc(job.unit.unitNumber)}` : ""}).</p>
      ${quote.availableDate ? `<p>Available: <strong>${quote.availableDate.toLocaleDateString("en-GB")}</strong></p>` : ""}
      ${quote.note ? `<p>Note: ${esc(quote.note)}</p>` : ""}
      <p>Compare the quotes and accept one on the job in Maintenance.</p>`;
    const sent = new Set<string>();
    for (const m of await getPropertyManagers(job.propertyId, orgId)) {
      if (!(await wantsEmail(m.userId, "NOTIFICATION"))) continue;
      sent.add(m.email.toLowerCase());
      await sendNotificationEmail(m.email, subject, html, { organizationId: orgId, caseThreadId: job.caseThreadId ?? null }).catch(() => {});
    }
    if (quote.requestedByUserId) {
      const u = await prisma.user.findUnique({ where: { id: quote.requestedByUserId }, select: { email: true, isActive: true } });
      if (u?.email && u.isActive && !sent.has(u.email.toLowerCase()) && (await wantsEmail(quote.requestedByUserId, "NOTIFICATION"))) {
        await sendNotificationEmail(u.email, subject, html, { organizationId: orgId, userId: quote.requestedByUserId }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[quotes] notifyQuoteReceived failed:", e);
  }
}

/** The accepted vendor is told (owner decision: the winner only). Never throws. */
export async function emailQuoteAccepted(job: QuoteJob, quote: QuoteRow): Promise<boolean> {
  const to = quote.vendor.email?.trim();
  if (!to) return false;
  const sender = job.property.organization?.name ?? job.property.name;
  const label = quote.amount !== null ? formatCurrency(quote.amount, job.property.currency ?? "KES") : null;
  try {
    await sendNotificationEmail(
      to,
      `Quote accepted — ${job.title} (${job.property.name})`,
      `
        <p>Dear ${esc(quote.vendor.name)},</p>
        <p>${esc(sender)} has accepted your quote${label ? ` of <strong>${esc(label)}</strong>` : ""} for:</p>
        <p><strong>${esc(job.title)}</strong><br/>
        ${esc(job.property.name)}${job.unit ? ` — Unit ${esc(job.unit.unitNumber)}` : ""}</p>
        <p>We'll be in touch to arrange access.</p>
      `,
      { organizationId: job.property.organizationId ?? null, caseThreadId: job.caseThreadId ?? null },
    );
    return true;
  } catch {
    return false;
  }
}

/** A line on the job's case timeline, and a forward-only move to a stage. Best-effort. */
export async function caseNote(job: QuoteJob, actorName: string, body: string, moveTo?: string): Promise<void> {
  if (!job.caseThreadId) return;
  await prisma.caseEvent.create({ data: { caseThreadId: job.caseThreadId, kind: "COMMENT", actorName, body } }).catch(() => {});
  if (!moveTo) return;
  try {
    const thread = await prisma.caseThread.findUnique({ where: { id: job.caseThreadId }, select: { currentStageIndex: true, workflowKey: true, caseType: true } });
    if (!thread || thread.caseType !== "MAINTENANCE") return;
    const target = getStageByKey(getWorkflow("MAINTENANCE"), moveTo);
    if (target && target.index > thread.currentStageIndex) await advanceCase(job.caseThreadId, target.index, { actorName, note: body });
  } catch (e) {
    console.error("[quotes] case advance failed:", e);
  }
}
