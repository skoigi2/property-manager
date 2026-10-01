import { NextRequest } from "next/server";
import { z } from "zod";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { notifyTenantMessage } from "@/lib/portal-message-notify";

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

  // Email the property's managers (link to the conversation; it's back in
  // their Inbox regardless) — see src/lib/portal-message-notify.ts.
  await notifyTenantMessage(thread.id, "reply", parsed.data.body.trim());

  return Response.json({ ok: true });
}
