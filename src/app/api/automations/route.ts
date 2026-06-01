import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AUTOMATION_DEFS, DEF_BY_KEY, ensureAutomationTemplates } from "@/lib/automation-registry";

// GET /api/automations — list this org's automation templates merged with the
// static display metadata (trigger / actions) from the registry, plus the
// org's properties and any per-property overrides.
export async function GET() {
  const { session, error } = await requireManager();
  if (error) return error;

  const organizationId = session!.user.organizationId;
  if (!organizationId) return Response.json({ automations: [], properties: [] });

  await ensureAutomationTemplates(organizationId);

  const propertyIds = (await getAccessiblePropertyIds()) ?? [];

  const [templates, properties, overrides] = await Promise.all([
    prisma.automationTemplate.findMany({ where: { organizationId } }),
    prisma.property.findMany({
      where: { organizationId, id: { in: propertyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.automationPropertyOverride.findMany({
      where: { organizationId, propertyId: { in: propertyIds } },
      select: { automationKey: true, propertyId: true, enabled: true },
    }),
  ]);

  // overrides keyed by automationKey → { propertyId: enabled }
  const overridesByKey = new Map<string, Record<string, boolean>>();
  for (const o of overrides) {
    const m = overridesByKey.get(o.automationKey) ?? {};
    m[o.propertyId] = o.enabled;
    overridesByKey.set(o.automationKey, m);
  }

  // Order by the registry's declared order (workflows, then notifications, then
  // reminders), not alphabetically.
  const order = new Map(AUTOMATION_DEFS.map((d, i) => [d.key, i]));
  const automations = templates
    .filter((t) => DEF_BY_KEY.has(t.key))
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
    .map((t) => {
      const def = DEF_BY_KEY.get(t.key)!;
      return {
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        enabled: t.enabled,
        trigger: def.trigger,
        actions: def.actions,
        category: def.category,
        overrides: overridesByKey.get(t.key) ?? {},
      };
    });

  return Response.json({ automations, properties });
}
