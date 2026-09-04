import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { orgAdminWhere } from "@/lib/manager-recipients";
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

  const [templates, properties, overrides, admins, managerAccess, org] = await Promise.all([
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
    // Org-admins (membership role) receive alerts for every property in the org.
    prisma.user.findMany({
      where: orgAdminWhere(organizationId),
      select: { name: true, email: true },
    }),
    // Managers (membership role) receive alerts for the properties they have access to.
    prisma.propertyAccess.findMany({
      where: {
        propertyId: { in: propertyIds },
        user: { isActive: true, email: { not: null }, organizationMemberships: { some: { organizationId, role: "MANAGER" } } },
      },
      select: { propertyId: true, user: { select: { name: true, email: true } } },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { email: true, name: true } }),
  ]);

  // Resolve the notification recipients per property, mirroring
  // getPropertyManagers (admins + managers-with-access, else org-email fallback).
  const recipients: Record<string, { name: string; email: string; fallback: boolean }[]> = {};
  for (const p of properties) {
    const list = [
      ...admins.map((u) => ({ name: u.name ?? u.email!, email: u.email!, fallback: false })),
      ...managerAccess
        .filter((m) => m.propertyId === p.id && m.user?.email)
        .map((m) => ({ name: m.user!.name ?? m.user!.email!, email: m.user!.email!, fallback: false })),
    ];
    // De-dupe by email (an admin could also hold PropertyAccess).
    const seen = new Set<string>();
    const deduped = list.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));
    if (deduped.length > 0) {
      recipients[p.id] = deduped;
    } else if (org?.email) {
      recipients[p.id] = [{ name: org.name ?? org.email, email: org.email, fallback: true }];
    } else {
      recipients[p.id] = [];
    }
  }

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

  return Response.json({ automations, properties, recipients });
}
