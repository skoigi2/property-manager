import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createApprovalSchema } from "@/lib/validations";
import { sendNotificationEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({
    where: { id: params.id },
    include: { property: { select: { id: true, name: true } } },
  });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = createApprovalSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
  const now = new Date();

  // Array-form transaction: create request + event + bump activity + set waitingOn
  const [request] = await prisma.$transaction([
    prisma.approvalRequest.create({
      data: {
        caseThreadId: thread.id,
        requestedByUserId: session!.user.id,
        requestedFromEmail: data.requestedFromEmail,
        requestedFromName: data.requestedFromName ?? null,
        question: data.question,
        amount: data.amount ?? null,
        currency: data.currency ?? null,
        expiresAt,
      },
    }),
    prisma.caseThread.update({
      where: { id: thread.id },
      data: { waitingOn: "OWNER", lastActivityAt: now },
    }),
  ]);

  // Now create the CaseEvent referencing the approval request id
  await prisma.caseEvent.create({
    data: {
      caseThreadId: thread.id,
      kind: "APPROVAL_REQUESTED",
      actorUserId: session!.user.id,
      actorEmail: session!.user.email ?? null,
      actorName: session!.user.name ?? null,
      body: `Approval requested from ${data.requestedFromEmail}: ${data.question}${
        data.amount != null ? `\nAmount: ${formatCurrency(data.amount, data.currency ?? "USD")}` : ""
      }`,
      meta: {
        approvalRequestId: request.id,
        amount: data.amount ?? null,
        currency: data.currency ?? null,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  // Fire-and-forget approval email with magic link
  const origin = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  const link = `${origin}/approve/${request.token}`;
  const amountLine = data.amount != null
    ? `<p style="font-size: 18px; font-weight: 600; color: #1a1a2e;">${formatCurrency(data.amount, data.currency ?? "USD")}</p>`
    : "";
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a2e;">Approval requested</h2>
      <p style="color: #4b5563;">${session!.user.name ?? session!.user.email ?? "A manager"} has requested your approval for the following:</p>
      <div style="background: #f9fafb; border-left: 3px solid #d4a045; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; color: #111827; font-size: 15px;">${escapeHtml(data.question)}</p>
        ${amountLine}
        <p style="margin: 8px 0 0; color: #6b7280; font-size: 13px;">${escapeHtml(thread.property.name)} · ${escapeHtml(thread.title)}</p>
      </div>
      <a href="${link}" style="display: inline-block; background: #1a1a2e; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Review &amp; respond</a>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This request expires on ${expiresAt.toUTCString()}.</p>
    </div>
  `;
  sendNotificationEmail(data.requestedFromEmail, `Approval requested — ${thread.title}`, html, {
    caseThreadId: thread.id,
  }).catch((e) => console.error("approval email send failed:", e));

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "ApprovalRequest",
    resourceId: request.id,
    organizationId: thread.organizationId,
    after: { ...request, token: undefined },
  });

  return Response.json({ id: request.id, status: request.status, expiresAt: request.expiresAt }, { status: 201 });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
