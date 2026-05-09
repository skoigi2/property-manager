import { NextRequest } from "next/server";
import { z } from "zod";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.enum(["LEASE_QUERY", "PAYMENT_NOTIFICATION", "PERMISSION_REQUEST", "GENERAL"]),
  body: z.string().min(1).max(5000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const threads = await prisma.portalMessageThread.findMany({
    where: { tenantId: tenant.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, sender: true, createdAt: true, readByTenantAt: true },
      },
      _count: {
        select: {
          messages: { where: { sender: "MANAGER", readByTenantAt: null } },
        },
      },
    },
  });

  return Response.json(
    threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      lastMessageAt: t.lastMessageAt,
      preview: t.messages[0]?.body.slice(0, 120) ?? "",
      lastSender: t.messages[0]?.sender ?? null,
      unreadCount: t._count.messages,
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date();
  const thread = await prisma.portalMessageThread.create({
    data: {
      tenantId: tenant.id,
      subject: parsed.data.subject.trim(),
      category: parsed.data.category,
      status: "SENT",
      lastMessageAt: now,
      messages: {
        create: {
          body: parsed.data.body.trim(),
          sender: "TENANT",
        },
      },
    },
    include: { messages: true },
  });

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

      const subject = `New tenant message — ${tenant.name}: ${parsed.data.subject}`;
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
          <h2 style="margin:0 0 8px 0;font-size:20px">New message from tenant</h2>
          <p style="color:#6b7280;font-size:13px;margin-top:0">
            <strong>${esc(tenant.name)}</strong> · ${esc(property.name)} · Unit ${esc(tenant.unit.unitNumber)}
          </p>
          <p style="color:#374151;font-size:14px;margin:12px 0">
            <strong>Category:</strong> ${esc(parsed.data.category.replace("_", " "))}<br/>
            <strong>Subject:</strong> ${esc(parsed.data.subject)}
          </p>
          <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-family:sans-serif;font-size:13px;white-space:pre-wrap;color:#1a1a2e">${esc(parsed.data.body)}</pre>
          <p style="margin-top:16px;color:#6b7280;font-size:13px">Reply from the tenant detail page in your dashboard.</p>
        </div>
      `;

      for (const r of recipients) {
        if (!r.email) continue;
        try {
          await sendNotificationEmail(r.email, subject, html, { organizationId: orgId, userId: r.id });
        } catch (err) {
          console.error("[portal-msg] email failed", err);
        }
      }
    }
  } catch (err) {
    console.error("[portal-msg] notification block failed", err);
  }

  return Response.json({ id: thread.id }, { status: 201 });
}
