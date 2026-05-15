import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  type:         z.enum(["EMAIL"]),
  subject:      z.string().min(1).max(300),
  body:         z.string().max(5000).optional(),
  templateUsed: z.string().optional(),
  sentAt:       z.string().optional(),
  followUpDate: z.string().nullable().optional(),
  caseThreadId: z.string().optional().nullable(),
});

// ── GET /api/tenants/[id]/communication-log ──────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logs = await prisma.communicationLog.findMany({
    where: { tenantId: params.id },
    orderBy: { sentAt: "desc" },
  });

  return Response.json(logs);
}

// ── POST /api/tenants/[id]/communication-log ─────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { type, subject, body: bodyText, templateUsed, sentAt, followUpDate, caseThreadId } = parsed.data;

  // Validate caseThreadId belongs to an accessible property if provided.
  let validCaseThreadId: string | null = null;
  if (caseThreadId) {
    const thread = await prisma.caseThread.findUnique({
      where: { id: caseThreadId },
      select: { id: true, propertyId: true },
    });
    if (thread && accessibleIds.includes(thread.propertyId)) {
      validCaseThreadId = thread.id;
    }
  }

  const snippet = (bodyText ?? "").slice(0, 200);

  const [record] = await prisma.$transaction([
    prisma.communicationLog.create({
      data: {
        tenantId:      params.id,
        type,
        subject,
        body:          bodyText ?? null,
        templateUsed:  templateUsed ?? null,
        loggedByEmail: session!.user.email!,
        loggedByName:  session!.user.name ?? null,
        sentAt:        sentAt ? new Date(sentAt) : new Date(),
        followUpDate:  followUpDate ? new Date(followUpDate) : null,
        caseThreadId:  validCaseThreadId,
      },
    }),
    ...(validCaseThreadId
      ? [
          prisma.caseEvent.create({
            data: {
              caseThreadId: validCaseThreadId,
              kind: "EMAIL_SENT",
              actorUserId: session!.user.id,
              actorEmail: session!.user.email ?? null,
              actorName: session!.user.name ?? null,
              body: `${subject}\n\n${snippet}`,
              meta: { templateUsed: templateUsed ?? null, source: "communication-log" },
            },
          }),
          prisma.caseThread.update({
            where: { id: validCaseThreadId },
            data: { lastActivityAt: new Date() },
          }),
        ]
      : []),
  ]);

  return Response.json(record, { status: 201 });
}
