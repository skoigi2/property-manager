import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAddProperty, requireActiveSubscription } from "@/lib/subscription";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["AIRBNB", "LONGTERM"]),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "LAND", "GROUND_LEASE", "COMMERCIAL_SPECIAL_USE", "OTHER"]).optional(),
  categoryOther: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  landlordEntity: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  ownerId: z.string().optional(),
  managerId: z.string().optional(),
  managementFeeRate: z.number().optional(),
  managementFeeFlat: z.number().optional(),
  serviceChargeDefault: z.number().optional(),
  organizationId: z.string().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (ids === null) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Slim payload for the header property selector + currency calc.
  // Drops ~25 KB of unit metadata that PropertyProvider doesn't need on every nav.
  const minimal = new URL(req.url).searchParams.get("minimal") === "true";
  if (minimal) {
    const slim = await prisma.property.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, type: true, currency: true,
        // Org context for the super-admin header selector (properties span
        // many orgs there); harmless extra for org-scoped users.
        organizationId: true,
        organization: { select: { name: true } },
      },
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    });
    return Response.json(slim.map(({ organization, ...p }) => ({ ...p, orgName: organization?.name ?? null })));
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(todayStart.getTime() + 86400000);

  const properties = await prisma.property.findMany({
    where: { id: { in: ids } },
    include: {
      units: {
        select: {
          id: true, unitNumber: true, type: true, status: true, monthlyRent: true,
          // Needed by the unit edit modal's prefill — omitting these made
          // saving an edit silently wipe the missing fields.
          floor: true, sizeSqm: true, description: true, titleReference: true,
          paymentAccountId: true,
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
  // Creating a property changes the billable portfolio (tier property caps) —
  // admin-only. Managers add SAMPLE properties via POST /api/demo/seed instead.
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  if (!isSuperAdmin && session.user.orgRole !== "ADMIN") {
    return Response.json(
      { error: "Only admins can add properties. Ask your admin, or load a sample property to explore." },
      { status: 403 },
    );
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

  const resolvedOrgId = isSuperAdmin
    ? (parsed.data.organizationId ?? null)
    : (session.user.organizationId ?? null);

  const { organizationId: _orgId, ...propertyData } = parsed.data;
  try {
    const property = await prisma.property.create({
      data: { ...propertyData, organizationId: resolvedOrgId },
    });

    // Grant PropertyAccess to every member of the owning org so the new property
    // is visible to all managers/accountants — not just the creator. (Org-admins
    // already see all org properties via getAccessiblePropertyIds, but managers
    // are scoped to explicit grants.) Mirrors the demo-seed grantAccess() helper.
    // Falls back to just the creator when the property has no org (super-admin path).
    if (resolvedOrgId) {
      const members = await prisma.userOrganizationMembership.findMany({
        where: { organizationId: resolvedOrgId },
        select: { userId: true },
      });
      const userIds = new Set(members.map((m) => m.userId));
      userIds.add(session.user.id); // ensure the creator is always included
      await prisma.propertyAccess.createMany({
        data: Array.from(userIds).map((userId) => ({ userId, propertyId: property.id })),
        skipDuplicates: true,
      });
    } else {
      await prisma.propertyAccess.upsert({
        where: { userId_propertyId: { userId: session.user.id, propertyId: property.id } },
        create: { userId: session.user.id, propertyId: property.id },
        update: {},
      });
    }

    return Response.json(property, { status: 201 });
  } catch (err) {
    console.error("[POST /api/properties] create failed:", err);
    return Response.json(
      { error: "Property create failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
