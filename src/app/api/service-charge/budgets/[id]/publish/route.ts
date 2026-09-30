import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { authorizeBudget } from "@/lib/service-charge-access";

// Publish (or withdraw) the year's statements to the tenant portal.
const bodySchema = z.object({ published: z.boolean() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const publishedAt = parsed.data.published ? new Date() : null;
  await prisma.serviceChargeBudget.update({ where: { id: params.id }, data: { publishedAt } });
  await logAudit({
    userId: auth.session.user.id,
    userEmail: auth.session.user.email,
    organizationId: auth.budget.organizationId,
    action: "UPDATE",
    resource: "ServiceChargeBudget",
    resourceId: params.id,
    before: { publishedAt: auth.budget.publishedAt },
    after: { publishedAt },
  });
  return Response.json({ publishedAt });
}
