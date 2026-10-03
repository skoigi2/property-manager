import { NextRequest } from "next/server";
import { z } from "zod";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { notifyTenantMessage } from "@/lib/portal-message-notify";

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.enum(["LEASE_QUERY", "PAYMENT_NOTIFICATION", "PERMISSION_REQUEST", "GENERAL"]),
  body: z.string().min(1).max(5000),
});

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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

  // Email the property's managers (link to the conversation; it's in their
  // Inbox regardless) — see src/lib/portal-message-notify.ts.
  await notifyTenantMessage(thread.id, "new", parsed.data.body.trim());

  return Response.json({ id: thread.id }, { status: 201 });
}
