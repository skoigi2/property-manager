import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { authorizeBudget } from "@/lib/service-charge-access";
import { buildServiceChargeView } from "@/lib/service-charge-data";

// Set each current tenant's monthly service charge to their unit's share of
// the budget ÷ 12, so what is billed on account tracks the budget. Invoices
// already raised are not touched; the next ones bill the new figure.
const bodySchema = z.object({ unitIds: z.array(z.string()).max(500).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const view = await buildServiceChargeView(auth.budget);
  if (view.budget.total <= 0) return Response.json({ error: "The budget is empty — add its costs first." }, { status: 400 });
  const pick = parsed.data.unitIds ? new Set(parsed.data.unitIds) : null;
  const changes = view.units
    .filter((u) => u.tenant && (!pick || pick.has(u.unitId)) && Math.abs(u.tenant.currentCharge - u.suggestedMonthly) > 0.005)
    .map((u) => ({ tenantId: u.tenant!.id, tenantName: u.tenant!.name, unitNumber: u.unitNumber, from: u.tenant!.currentCharge, to: u.suggestedMonthly }));

  if (changes.length === 0) return Response.json({ updated: 0, changes });
  await prisma.$transaction(changes.map((c) => prisma.tenant.update({ where: { id: c.tenantId }, data: { serviceCharge: c.to } })));
  await logAudit({
    userId: auth.session.user.id,
    userEmail: auth.session.user.email,
    organizationId: auth.budget.organizationId,
    action: "UPDATE",
    resource: "ServiceChargeApply",
    resourceId: params.id,
    before: { charges: changes.map((c) => ({ tenantId: c.tenantId, serviceCharge: c.from })) },
    after: { charges: changes.map((c) => ({ tenantId: c.tenantId, serviceCharge: c.to })) },
  });
  return Response.json({ updated: changes.length, changes });
}
