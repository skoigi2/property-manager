import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AUTOMATION_DEFS, ensureAutomationTemplates } from "@/lib/automations";

// GET /api/automations — list this org's automation templates merged with the
// static display metadata (trigger / actions) from the registry.
export async function GET() {
  const { session, error } = await requireManager();
  if (error) return error;

  const organizationId = session!.user.organizationId;
  if (!organizationId) return Response.json({ automations: [] });

  await ensureAutomationTemplates(organizationId);

  const templates = await prisma.automationTemplate.findMany({
    where: { organizationId },
    orderBy: { key: "asc" },
  });

  const byKey = new Map(AUTOMATION_DEFS.map((d) => [d.key, d]));
  const automations = templates
    .filter((t) => byKey.has(t.key))
    .map((t) => {
      const def = byKey.get(t.key)!;
      return {
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        enabled: t.enabled,
        trigger: def.trigger,
        actions: def.actions,
      };
    });

  return Response.json({ automations });
}
