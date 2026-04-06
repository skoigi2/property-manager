import { requireManager, requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  orgId:         z.string(),
  propertyId:    z.string().optional().nullable(),
  label:         z.string().min(1).max(50),
  rate:          z.number().min(0).max(1),
  type:          z.enum(["ADDITIVE", "WITHHELD"]),
  appliesTo:     z.array(z.string()).min(1),
  isInclusive:   z.boolean().optional().default(false),
  effectiveFrom: z.string().optional(),
});

// GET /api/tax-configs?propertyId=&orgId=
export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  let orgId = searchParams.get("orgId") ?? session!.user.organizationId ?? "";

  // Super-admin has no organizationId in session; derive from the property when possible
  if (!orgId && propertyId) {
    const prop = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { organizationId: true },
    });
    orgId = prop?.organizationId ?? "";
  }

  if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

  try {
    const configs = await prisma.taxConfiguration.findMany({
      where: {
        orgId,
        ...(propertyId
          ? { OR: [{ propertyId: null }, { propertyId }] }
          : { propertyId: null }),
      },
      orderBy: [{ propertyId: "asc" }, { effectiveFrom: "desc" }],
    });

    return Response.json(configs);
  } catch (err: any) {
    console.error("[GET /api/tax-configs]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/tax-configs
export async function POST(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  try {
    const config = await prisma.taxConfiguration.create({
      data: {
        orgId:         data.orgId,
        propertyId:    data.propertyId ?? null,
        label:         data.label,
        rate:          data.rate,
        type:          data.type,
        appliesTo:     data.appliesTo,
        isInclusive:   data.isInclusive,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      },
    });

    await logAudit({
      userId:     session!.user.id,
      userEmail:  session!.user.email ?? "",
      action:     "CREATE",
      resource:   "TaxConfiguration",
      resourceId: config.id,
      after:      config,
    });

    return Response.json(config, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/tax-configs]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
