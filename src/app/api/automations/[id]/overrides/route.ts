import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// enabled: boolean → set a per-property override; null → clear it (inherit org).
const putSchema = z.object({
  propertyId: z.string().min(1),
  enabled: z.boolean().nullable(),
});

// PUT /api/automations/[id]/overrides — set or clear a per-property override for
// the automation. The [id] is the AutomationTemplate id (org-scoped).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const organizationId = session!.user.organizationId;
  const locked = await requireActiveSubscription(organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { propertyId, enabled } = parsed.data;

  const template = await prisma.automationTemplate.findUnique({ where: { id: params.id } });
  if (!template || template.organizationId !== organizationId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Caller must have access to the property being overridden.
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  if (enabled === null) {
    // Clear → inherit the org-level toggle.
    await prisma.automationPropertyOverride.deleteMany({
      where: { automationKey: template.key, propertyId },
    });
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "AutomationPropertyOverride",
      resourceId: `${template.key}:${propertyId}`,
      organizationId,
      after: { automationKey: template.key, propertyId, override: "cleared" },
    });
    return Response.json({ automationKey: template.key, propertyId, enabled: null });
  }

  await prisma.automationPropertyOverride.upsert({
    where: { automationKey_propertyId: { automationKey: template.key, propertyId } },
    create: { organizationId: organizationId!, automationKey: template.key, propertyId, enabled },
    update: { enabled },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "AutomationPropertyOverride",
    resourceId: `${template.key}:${propertyId}`,
    organizationId,
    after: { automationKey: template.key, propertyId, enabled },
  });

  return Response.json({ automationKey: template.key, propertyId, enabled });
}
