import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isExpired, redactToken, validateApprovalToken } from "@/lib/approval-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { respondToApprovalSchema } from "@/lib/validations";
import { sendNotificationEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { tryAutoAdvance } from "@/lib/case-workflows";

/**
 * GET — idempotent read of the approval request. Must NEVER mutate state so
 * that email link-preview scanners don't consume the token.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const req = await validateApprovalToken(params.token);
  if (!req) return Response.json({ error: "Not found" }, { status: 404 });

  const expired = req.status === "PENDING" && isExpired(req.expiresAt);

  return Response.json({
    status: expired ? "EXPIRED" : req.status,
    question: req.question,
    amount: req.amount,
    currency: req.currency,
    caseTitle: req.caseThread.title,
    propertyName: req.caseThread.property.name,
    unitNumber: req.caseThread.unit?.unitNumber ?? null,
    requestedByName: req.requestedBy.name ?? req.requestedBy.email ?? null,
    expiresAt: req.expiresAt.toISOString(),
    respondedAt: req.respondedAt?.toISOString() ?? null,
    respondedByName: req.respondedByName,
  });
}

/**
 * POST — single-use response. Rate-limited; state transitions only from
 * PENDING → APPROVED/REJECTED, or any status → DISPUTED (if previously
 * APPROVED/REJECTED).
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = getClientIp(req);
  const limit = rateLimit(`approval:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = respondToApprovalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, respondedByName } = parsed.data;
  const request = await validateApprovalToken(params.token);
  if (!request) return Response.json({ error: "Not found" }, { status: 404 });

  // Auto-expire stale tokens on first POST.
  if (request.status === "PENDING" && isExpired(request.expiresAt)) {
    await prisma.approvalRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    return Response.json({ error: "Approval expired", status: "EXPIRED" }, { status: 410 });
  }

  // DISPUTE is only valid against APPROVED/REJECTED.
  if (action === "DISPUTE") {
    if (request.status !== "APPROVED" && request.status !== "REJECTED") {
      return Response.json({ error: "Only completed approvals can be disputed", status: request.status }, { status: 409 });
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: "DISPUTED", disputedAt: now },
      }),
      prisma.caseEvent.create({
        data: {
          caseThreadId: request.caseThreadId,
          kind: "EXTERNAL_UPDATE",
          actorName: respondedByName,
          actorEmail: request.requestedFromEmail,
          body: `Approval response disputed by ${respondedByName} — flagged for manager review`,
          meta: { approvalRequestId: request.id, previousStatus: request.status },
        },
      }),
      prisma.caseThread.update({
        where: { id: request.caseThreadId },
        data: { waitingOn: "MANAGER", lastActivityAt: now },
      }),
    ]);
    // Notify the original requesting manager
    if (request.requestedBy.email) {
      sendNotificationEmail(
        request.requestedBy.email,
        `Approval response DISPUTED — ${request.caseThread.title}`,
        `<div style="font-family: sans-serif; padding: 24px;">
          <h3>Approval disputed</h3>
          <p>The approver flagged the response as "This wasn't me". The case has been reopened and is waiting on you for review.</p>
          <p><strong>Approver email:</strong> ${request.requestedFromEmail}<br/>
          <strong>Disputed by name:</strong> ${respondedByName}<br/>
          <strong>Previous status:</strong> ${request.status}</p>
        </div>`,
        { caseThreadId: request.caseThreadId, userId: request.requestedByUserId },
      ).catch((e) => console.error("dispute notification failed:", e));
    }
    await logAudit({
      userId: request.requestedByUserId,
      action: "UPDATE",
      resource: "ApprovalRequest",
      resourceId: request.id,
      organizationId: request.caseThread.organizationId,
      before: { status: request.status, token: redactToken(request.token) },
      after: { status: "DISPUTED", disputedAt: now },
    });
    return Response.json({ status: "DISPUTED", disputedAt: now });
  }

  // APPROVE / REJECT requires PENDING.
  if (request.status !== "PENDING") {
    return Response.json(
      {
        error: "This approval has already been responded to",
        status: request.status,
        respondedByName: request.respondedByName,
        respondedAt: request.respondedAt?.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const now = new Date();

  await prisma.$transaction([
    prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: newStatus,
        respondedAt: now,
        respondedByName,
        respondedFromIp: ip,
      },
    }),
    prisma.caseEvent.create({
      data: {
        caseThreadId: request.caseThreadId,
        kind: action === "APPROVE" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
        actorName: respondedByName,
        actorEmail: request.requestedFromEmail,
        body: `${action === "APPROVE" ? "Approved" : "Rejected"} by ${respondedByName}: ${request.question}`,
        meta: { approvalRequestId: request.id },
      },
    }),
    prisma.caseThread.update({
      where: { id: request.caseThreadId },
      data: { waitingOn: "NONE", lastActivityAt: now },
    }),
  ]);

  // Auto-advance the case if it was at "approval_requested"
  if (newStatus === "APPROVED") {
    await tryAutoAdvance(request.caseThreadId, { kind: "APPROVAL_GRANTED" });
  }

  // Confirmation email to approver (with "This wasn't me" link)
  const origin = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  const disputeLink = `${origin}/approve/${request.token}?dispute=1`;
  const amountLine = request.amount != null
    ? `<p><strong>Amount:</strong> ${formatCurrency(request.amount, request.currency ?? "USD")}</p>`
    : "";
  sendNotificationEmail(
    request.requestedFromEmail,
    `Your approval was recorded — ${request.caseThread.title}`,
    `<div style="font-family: sans-serif; max-width: 520px; padding: 24px;">
      <h3>Thanks, ${escapeHtml(respondedByName)} — we recorded your decision.</h3>
      <p><strong>Decision:</strong> ${newStatus}</p>
      <p><strong>Question:</strong> ${escapeHtml(request.question)}</p>
      ${amountLine}
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
        Wasn't you? <a href="${disputeLink}">Flag this approval for review</a>.
      </p>
    </div>`,
    { caseThreadId: request.caseThreadId },
  ).catch((e) => console.error("confirmation email failed:", e));

  await logAudit({
    userId: request.requestedByUserId,
    action: "UPDATE",
    resource: "ApprovalRequest",
    resourceId: request.id,
    organizationId: request.caseThread.organizationId,
    before: { status: "PENDING", token: redactToken(request.token) },
    after: { status: newStatus, respondedByName, respondedAt: now },
  });

  return Response.json({ status: newStatus, respondedByName, respondedAt: now });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
