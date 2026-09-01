import { requireAuth, requirePropertyAccess } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().min(1, "Unit number required"),
  type: z.enum(["BEDSITTER", "ONE_BED", "TWO_BED", "THREE_BED", "FOUR_BED", "FIVE_BED", "PENTHOUSE", "COMMERCIAL", "OTHER"]),
  status: z.enum(["ACTIVE", "VACANT", "LISTED", "UNDER_NOTICE", "MAINTENANCE", "OWNER_OCCUPIED"]).default("VACANT"),
  hasDsq: z.boolean().optional(),
  monthlyRent: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  floor: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().optional()),
  sizeSqm: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  description: z.string().optional(),
  titleReference: z.string().optional(),
  // Per-unit payment-account override (blank = inherit property default)
  paymentAccountId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  const units = await prisma.unit.findMany({
    where: propertyId ? { propertyId } : undefined,
    include: {
      property: { select: { name: true, type: true } },
      tenants: { where: { isActive: true }, take: 1 },
    },
    orderBy: { unitNumber: "asc" },
  });

  return Response.json(units);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.orgRole !== "ADMIN" && session.user.orgRole !== "MANAGER") return Response.json({ error: "Forbidden" }, { status: 403 });
  const locked = await requireActiveSubscription(session.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const access = await requirePropertyAccess(parsed.data.propertyId);
  if (!access.ok) return access.error!;

  // A payment account must belong to the property's organisation.
  if (parsed.data.paymentAccountId) {
    const [account, property] = await Promise.all([
      prisma.paymentAccount.findUnique({
        where: { id: parsed.data.paymentAccountId },
        select: { organizationId: true },
      }),
      prisma.property.findUnique({ where: { id: parsed.data.propertyId }, select: { organizationId: true } }),
    ]);
    if (!account || account.organizationId !== property?.organizationId) {
      return Response.json({ error: "Payment account not found" }, { status: 400 });
    }
  }

  // Check for duplicate unit number within same property
  const existing = await prisma.unit.findFirst({
    where: { propertyId: parsed.data.propertyId, unitNumber: parsed.data.unitNumber },
  });
  if (existing) return Response.json({ error: "Unit number already exists in this property" }, { status: 409 });

  const unit = await prisma.unit.create({ data: parsed.data });
  return Response.json(unit, { status: 201 });
}
