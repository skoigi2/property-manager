import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const replySchema = z.object({ body: z.string().min(1).max(5000) });
const patchSchema = z.object({ status: z.enum(["SENT", "READ", "RESOLVED"]) });

async function loadThreadWithAccess(tenantId: string, threadId: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { thread: null, err: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const thread = await prisma.portalMessageThread.findUnique({
    where: { id: threadId },
    include: {
      tenant: { select: { id: true, name: true, unit: { select: { property: { select: { id: true } } } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread || thread.tenantId !== tenantId) return { thread: null, err: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(thread.tenant.unit.property.id)) {
    return { thread: null, err: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { thread, err: null };
}

export async function GET(_req: Request, { params }: { params: { id: string; threadId: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { thread, err } = await loadThreadWithAccess(params.id, params.threadId);
  if (err) return err;

  // Mark tenant messages as read by manager + flip thread status SENT → READ.
  const now = new Date();
  await prisma.$transaction([
    prisma.portalMessage.updateMany({
      where: { threadId: thread!.id, sender: "TENANT", readByManagerAt: null },
      data: { readByManagerAt: now },
    }),
    ...(thread!.status === "SENT"
      ? [prisma.portalMessageThread.update({ where: { id: thread!.id }, data: { status: "READ" } })]
      : []),
  ]);

  return Response.json({
    id: thread!.id,
    subject: thread!.subject,
    category: thread!.category,
    status: thread!.status === "SENT" ? "READ" : thread!.status,
    tenantName: thread!.tenant.name,
    messages: thread!.messages.map((m) => ({
      id: m.id,
      body: m.body,
      sender: m.sender,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string; threadId: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { thread, err } = await loadThreadWithAccess(params.id, params.threadId);
  if (err) return err;

  const body = await req.json().catch(() => null);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date();
  await prisma.$transaction([
    prisma.portalMessage.create({
      data: {
        threadId: thread!.id,
        body: parsed.data.body.trim(),
        sender: "MANAGER",
        authorUserId: session!.user.id,
      },
    }),
    prisma.portalMessage.updateMany({
      where: { threadId: thread!.id, sender: "TENANT", readByManagerAt: null },
      data: { readByManagerAt: now },
    }),
    prisma.portalMessageThread.update({
      where: { id: thread!.id },
      data: { lastMessageAt: now, status: "READ" },
    }),
  ]);

  return Response.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string; threadId: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { thread, err } = await loadThreadWithAccess(params.id, params.threadId);
  if (err) return err;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.portalMessageThread.update({
    where: { id: thread!.id },
    data: { status: parsed.data.status },
  });

  return Response.json({ ok: true, status: parsed.data.status });
}
