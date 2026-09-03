import { requireManager, requirePermissionWrite } from "@/lib/auth-utils";
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
// Same gate as the rest of organisation settings (ADMIN + MANAGER, not
// ACCOUNTANT, plus the subscription write-lock). It used to demand the ADMIN
// org role while the Settings page admitted managers, so a manager saw the
// Add button and got a bare "Forbidden".
export async function POST(req: Request) {
  const { session, error } = await requirePermissionWrite("ORG_SETTINGS");
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json({ error: `${first?.path.join(".") || "input"}: ${first?.message ?? "invalid"}` }, { status: 400 });
  }

  const data = parsed.data;
  // An org member may only write rules for their own organisation; a
  // super-admin (no session org) may write for any.
  const sessionOrg = session!.user.organizationId;
  if (sessionOrg && data.orgId !== sessionOrg) {
    return Response.json({ error: "You can only manage tax rules for your own organisation" }, { status: 403 });
  }
  if (data.propertyId) {
    const prop = await prisma.property.findUnique({ where: { id: data.propertyId }, select: { organizationId: true } });
    if (!prop || prop.organizationId !== data.orgId) {
      return Response.json({ error: "That property does not belong to this organisation" }, { status: 400 });
    }
  }

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
      organizationId: session!.user.organizationId,
      after:      config,
    });

    return Response.json(config, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/tax-configs]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
