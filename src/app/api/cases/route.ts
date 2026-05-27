import { requireAuth, requireManager, getAccessiblePropertyIds, requirePropertyAccess } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createCaseSchema } from "@/lib/validations";

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const waitingOn = searchParams.get("waitingOn");
  const assignedToMe = searchParams.get("assignedToMe") === "true";
  const caseType = searchParams.get("caseType");

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const cases = await prisma.caseThread.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      ...(status ? { status: status as never } : {}),
      ...(waitingOn ? { waitingOn: waitingOn as never } : {}),
      ...(caseType ? { caseType: caseType as never } : {}),
      ...(assignedToMe && session?.user.id ? { assignedToUserId: session.user.id } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit:     { select: { id: true, unitNumber: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return Response.json(cases);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const access = await requirePropertyAccess(parsed.data.propertyId);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { organizationId: true },
  });
  if (!property?.organizationId) {
    return Response.json({ error: "Property has no organization" }, { status: 400 });
  }

  const { initialBody, ...threadData } = parsed.data;
  const now = new Date();

  const thread = await prisma.caseThread.create({
    data: {
      ...threadData,
      organizationId: property.organizationId,
      stageStartedAt: now,
      lastActivityAt: now,
    },
  });

  if (initialBody) {
    await prisma.caseEvent.create({
      data: {
        caseThreadId: thread.id,
        kind: "COMMENT",
        actorUserId: session!.user.id,
        actorEmail: session!.user.email ?? null,
        actorName: session!.user.name ?? null,
        body: initialBody,
      },
    });
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: property.organizationId,
    after: thread,
  });

  return Response.json(thread, { status: 201 });
}
