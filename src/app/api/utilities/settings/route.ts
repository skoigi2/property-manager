import { requireManager, requireRolesWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { utilitySettingSchema } from "@/lib/validations";
import { DEFAULT_UNIT_LABEL, UTILITY_TYPES } from "@/lib/utility-billing";

/** GET /api/utilities/settings?propertyId= — manager tier; defaults filled in. */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const rows = await prisma.utilitySetting.findMany({ where: { propertyId } });
  return Response.json(
    UTILITY_TYPES.map((utility) => {
      const s = rows.find((r) => r.utility === utility);
      return {
        utility,
        unitLabel: s?.unitLabel ?? DEFAULT_UNIT_LABEL[utility],
        holdInvoicesForReadings: s?.holdInvoicesForReadings ?? true,
        requirePhoto: s?.requirePhoto ?? false,
      };
    }),
  );
}

/** PUT /api/utilities/settings — ADMIN / MANAGER; upserts one property + utility row. */
export async function PUT(req: Request) {
  const { session, error } = await requireRolesWrite(["ADMIN", "MANAGER"]);
  if (error) return error;

  const parsed = utilitySettingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  const { propertyId, utility, ...rest } = parsed.data;

  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const setting = await prisma.utilitySetting.upsert({
    where: { propertyId_utility: { propertyId, utility } },
    create: { propertyId, utility, unitLabel: rest.unitLabel ?? DEFAULT_UNIT_LABEL[utility], ...rest },
    update: rest,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "UtilitySetting",
    resourceId: setting.id,
    organizationId: session!.user.organizationId,
    after: { utility, unitLabel: setting.unitLabel, holdInvoicesForReadings: setting.holdInvoicesForReadings, requirePhoto: setting.requirePhoto },
  });

  return Response.json(setting);
}
