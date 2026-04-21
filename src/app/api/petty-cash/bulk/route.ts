import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reassign"), ids: z.array(z.string()).min(1), propertyId: z.string().nullable() }),
  z.object({ action: z.literal("retype"),   ids: z.array(z.string()).min(1), type: z.enum(["IN", "OUT"]) }),
  z.object({ action: z.literal("delete"),   ids: z.array(z.string()).min(1) }),
]);

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, ids } = parsed.data;

  // Verify all requested entries are accessible to this user
  const accessible = await prisma.pettyCash.findMany({
    where: {
      id: { in: ids },
      OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }],
    },
    select: { id: true },
  });
  const accessibleIds = accessible.map((e) => e.id);
  if (accessibleIds.length !== ids.length) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "delete") {
    await prisma.pettyCash.deleteMany({ where: { id: { in: ids } } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "PettyCash", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, before: { ids } });
    return Response.json({ success: true, count: ids.length });
  }

  if (action === "reassign") {
    const { propertyId } = parsed.data;
    if (propertyId && !propertyIds.includes(propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.pettyCash.updateMany({ where: { id: { in: ids } }, data: { propertyId } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "PettyCash", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, after: { propertyId } });
    return Response.json({ success: true, count: ids.length });
  }

  if (action === "retype") {
    const { type } = parsed.data;
    await prisma.pettyCash.updateMany({ where: { id: { in: ids } }, data: { type } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "PettyCash", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, after: { type } });
    return Response.json({ success: true, count: ids.length });
  }
}
