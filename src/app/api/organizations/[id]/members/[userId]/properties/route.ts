import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/organizations/[id]/members/[userId]/properties
 *
 * Removes all PropertyAccess records for a user within this org.
 * Promotes the user from "property-level" to "org-level" (membership stays).
 *
 * Access: org-admin of this org OR super-admin.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const isSuperAdmin =
    session!.user.role === "ADMIN" && session!.user.organizationId === null;
  const isOrgAdmin =
    session!.user.orgRole === "ADMIN" &&
    session!.user.organizationId === params.id;

  if (!isSuperAdmin && !isOrgAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.propertyAccess.deleteMany({
    where: {
      userId: params.userId,
      property: { organizationId: params.id },
    },
  });

  return new Response(null, { status: 204 });
}
