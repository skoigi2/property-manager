import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({ organizationId: z.string() });

// POST /api/auth/switch-org — update the user's active org
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const { organizationId } = parsed.data;

  // Verify the user is actually a member of this org
  const membership = await prisma.userOrganizationMembership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
    select: { role: true, isBillingOwner: true },
  });
  if (!membership) {
    return Response.json({ error: "You are not a member of this organisation" }, { status: 403 });
  }

  // Count total memberships for the membershipCount field
  const membershipCount = await prisma.userOrganizationMembership.count({
    where: { userId: session.user.id },
  });

  const previousOrgId = session.user.organizationId ?? null;

  // Update the user's active org in the database
  await prisma.user.update({
    where: { id: session.user.id },
    data: { organizationId },
  });

  await logAudit({
    userId:    session.user.id,
    userEmail: session.user.email ?? null,
    action:    "UPDATE",
    resource:  "ActiveOrg",
    resourceId: session.user.id,
    organizationId,
    before: { organizationId: previousOrgId },
    after:  { organizationId },
  });

  return Response.json({
    ok: true,
    organizationId,
    orgRole:        membership.role,
    isBillingOwner: membership.isBillingOwner,
    membershipCount,
  });
}
