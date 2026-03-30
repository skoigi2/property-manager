import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  });
  if (!membership) {
    return Response.json({ error: "You are not a member of this organisation" }, { status: 403 });
  }

  // Update the user's active org in the database
  await prisma.user.update({
    where: { id: session.user.id },
    data: { organizationId },
  });

  return Response.json({ ok: true, organizationId });
}
