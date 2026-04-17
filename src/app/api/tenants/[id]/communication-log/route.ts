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

  const { type, subject, body: bodyText, templateUsed, sentAt, followUpDate } = parsed.data;

  const record = await prisma.communicationLog.create({
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
    },
  });

  return Response.json(record, { status: 201 });
}
