import { requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/properties/[id]/reassign-preview?targetOrgId=xxx
 *
 * Dry-run: which users will gain target-org membership, and which will also
 * lose their source-org membership (because this is their only source-org property).
 *
 * Works even when the property currently has no org (organizationId = null).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const targetOrgId = searchParams.get("targetOrgId");
  if (!targetOrgId) return Response.json({ error: "targetOrgId required" }, { status: 400 });

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    select: {
      organizationId: true,
      propertyAccess: {
        select: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });
  if (property.organizationId === targetOrgId) {
    return Response.json({ willLeaveSource: [], willRemainInSource: [] });
  }

  const sourceOrgId = property.organizationId; // may be null
  const accessUsers = property.propertyAccess.map((a) => a.user);

  if (accessUsers.length === 0) {
    return Response.json({ willLeaveSource: [], willRemainInSource: [] });
  }

  if (!sourceOrgId) {
    // Property has no current org — all PropertyAccess users will simply gain
    // membership in the target org (nothing to "leave").
    return Response.json({ willLeaveSource: accessUsers, willRemainInSource: [] });
  }

  // Source org exists: categorise by whether user has other properties there
  const categorised = await Promise.all(
    accessUsers.map(async (u) => {
      const isMember = await prisma.userOrganizationMembership.findUnique({
        where: { userId_organizationId: { userId: u.id, organizationId: sourceOrgId } },
      });
      // If they're not even a member of the source org, treat as "leaves" (they just gain target)
      if (!isMember) return { user: u, otherSourceProperties: 0 };

      const otherSourceProperties = await prisma.propertyAccess.count({
        where: {
          userId: u.id,
          propertyId: { not: params.id },
          property: { organizationId: sourceOrgId },
        },
      });
      return { user: u, otherSourceProperties };
    })
  );

  const willLeaveSource = categorised
    .filter((c) => c.otherSourceProperties === 0)
    .map((c) => c.user);

  const willRemainInSource = categorised
    .filter((c) => c.otherSourceProperties > 0)
    .map((c) => c.user);

  return Response.json({ willLeaveSource, willRemainInSource });
}
