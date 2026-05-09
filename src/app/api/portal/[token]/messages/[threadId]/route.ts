import { NextRequest } from "next/server";
import { z } from "zod";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";

const replySchema = z.object({
  body: z.string().min(1).max(5000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; threadId: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const thread = await prisma.portalMessageThread.findUnique({
    where: { id: params.threadId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!thread || thread.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Mark all manager messages as read by tenant.
  await prisma.portalMessage.updateMany({
    where: { threadId: thread.id, sender: "MANAGER", readByTenantAt: null },
    data: { readByTenantAt: new Date() },
  });

  return Response.json({
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    status: thread.status,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      sender: m.sender,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; threadId: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const thread = await prisma.portalMessageThread.findUnique({
    where: { id: params.threadId },
    select: { id: true, tenantId: true, subject: true, status: true },
  });
  if (!thread || thread.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (thread.status === "RESOLVED") {
    return Response.json({ error: "Thread is resolved" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date();
  await prisma.$transaction([
    prisma.portalMessage.create({
      data: {
        threadId: thread.id,
        body: parsed.data.body.trim(),
        sender: "TENANT",
      },
    }),
    prisma.portalMessageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, status: "SENT" },
    }),
  ]);

  // Notify managers
  try {
    const property = tenant.unit.property;
    const orgId = property.organizationId;
    if (orgId) {
      const recipients = await prisma.user.findMany({
        where: {
          isActive: true,
          email: { not: null },
          OR: [
            { organizationId: orgId, role: "ADMIN" },
            { role: "MANAGER", propertyAccess: { some: { propertyId: property.id } } },
          ],
        },
        select: { email: true, id: true },
      });

      const subject = `New tenant reply — ${tenant.name}: ${thread.subject}`;
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
          <h2 style="margin:0 0 8px 0;font-size:20px">Tenant replied to a thread</h2>
          <p style="color:#6b7280;font-size:13px;margin-top:0">
            <strong>${esc(tenant.name)}</strong> · ${esc(property.name)} · Unit ${esc(tenant.unit.unitNumber)}
          </p>
          <p style="color:#374151;font-size:14px;margin:12px 0">
            <strong>Subject:</strong> ${esc(thread.subject)}
          </p>
          <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-family:sans-serif;font-size:13px;white-space:pre-wrap;color:#1a1a2e">${esc(parsed.data.body)}</pre>
        </div>
      `;
      for (const r of recipients) {
        if (!r.email) continue;
        try { await sendNotificationEmail(r.email, subject, html, { organizationId: orgId, userId: r.id }); }
        catch (err) { console.error("[portal-msg-reply] email failed", err); }
      }
    }
  } catch (err) {
    console.error("[portal-msg-reply] notification block failed", err);
  }

  return Response.json({ ok: true });
}
