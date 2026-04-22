import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAddProperty, requireActiveSubscription } from "@/lib/subscription";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["AIRBNB", "LONGTERM"]),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "OTHER"]).optional(),
  categoryOther: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  ownerId: z.string().optional(),
  managerId: z.string().optional(),
  managementFeeRate: z.number().optional(),
  managementFeeFlat: z.number().optional(),
  serviceChargeDefault: z.number().optional(),
  organizationId: z.string().optional(),
});

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (ids === null) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(todayStart.getTime() + 86400000);

  const properties = await prisma.property.findMany({
    where: { id: { in: ids } },
    include: {
      units: {
        select: {
          id: true, unitNumber: true, type: true, status: true, monthlyRent: true,
          _count: { select: { tenants: { where: { isActive: true } } } },
          incomeEntries: {
            where: { type: "AIRBNB", checkIn: { lte: todayEnd }, checkOut: { gt: todayStart } },
            select: { id: true, checkIn: true, checkOut: true },
          },
        },
      },
      owner:   { select: { id: true, name: true, email: true } },
      manager: { select: { id: true, name: true, email: true } },
      agreement: { select: { latePaymentInterestRate: true } },
      _count: { select: { units: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json(properties);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.orgRole !== "ADMIN" && session.user.orgRole !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Subscription lock guard ───────────────────────────────────────────────
  const orgId = session.user.organizationId;
  const subLocked = await requireActiveSubscription(orgId);
  if (subLocked) return subLocked;
  if (orgId) {
    const allowed = await canAddProperty(orgId);
    if (!allowed) {
      return Response.json(
        { error: "Property limit reached for your current plan. Upgrade to add more properties." },
        { status: 402 },
      );
    }
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  const resolvedOrgId = isSuperAdmin
    ? (parsed.data.organizationId ?? null)
    : (session.user.organizationId ?? null);

  const { organizationId: _orgId, ...propertyData } = parsed.data;
  const property = await prisma.property.create({
    data: { ...propertyData, organizationId: resolvedOrgId },
  });

  // Automatically grant the creating manager access
  await prisma.propertyAccess.create({
    data: { userId: session.user.id, propertyId: property.id },
  });

  return Response.json(property, { status: 201 });
}
