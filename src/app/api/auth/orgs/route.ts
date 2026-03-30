import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auth/orgs — returns all org memberships for the current user
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.userOrganizationMembership.findMany({
    where: { userId: session.user.id },
    include: {
      organization: {
        select: { id: true, name: true, logoUrl: true, isActive: true },
      },
    },
    orderBy: { organization: { name: "asc" } },
  });

  return Response.json(memberships.map((m) => m.organization));
}
