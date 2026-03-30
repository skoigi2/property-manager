import { requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/properties/[id]/reassign-preview?targetOrgId=xxx
 *
 * Returns a dry-run preview of what would happen if this property were moved
 * to the target org — which users would gain membership in the target org,
 * and which would keep their source org membership (because they have other properties there).
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

  // Load the property and its current org
  const property = await prisma.property.findUnique({
    where: { id: params.id },
    select: {
      organizationId: true,
      propertyAccess: {
        select: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });

  const sourceOrgId = property.organizationId;
  if (!sourceOrgId) return Response.json({ willLeaveSource: [], willRemainInSource: [] });
  if (sourceOrgId === targetOrgId) return Response.json({ willLeaveSource: [], willRemainInSource: [] });

  // Users with access to this property who belong to the source org
  const accessUsers = property.propertyAccess.map((a) => a.user);
  const sourceMembers = await Promise.all(
    accessUsers.map(async (u) => {
      const isMember = await prisma.userOrganizationMembership.findUnique({
        where: { userId_organizationId: { userId: u.id, organizationId: sourceOrgId } },
      });
      return isMember ? u : null;
    })
  );
  const eligibleUsers = sourceMembers.filter(Boolean) as typeof accessUsers;

  // For each eligible user, count their OTHER PropertyAccess records still in the source org
  const categorised = await Promise.all(
    eligibleUsers.map(async (u) => {
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
