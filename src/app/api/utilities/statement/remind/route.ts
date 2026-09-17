import { z } from "zod";
import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { loadUtilityStatement } from "@/lib/utility-statement-data";
import { sendUtilityReminder } from "@/lib/utility-reminder";

export const maxDuration = 60;

const schema = z.object({
  propertyId: z.string().min(1),
  tenantIds: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * POST /api/utilities/statement/remind { propertyId, tenantIds } — manager
 * tier. Emails each selected tenant what they still owe for water and
 * electricity (per invoice), logged to their Comms tab. Tenants with nothing
 * unpaid or no email address are reported back as failures, never silently
 * skipped.
 */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Pick at least one tenant" }, { status: 400 });
  const { propertyId, tenantIds } = parsed.data;

  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  // Always the full, all-time position — a reminder must not understate the debt.
  const result = await loadUtilityStatement({ propertyId, unpaidOnly: true });
  if (!result) return Response.json({ error: "Property not found" }, { status: 404 });
  const org = result.property.organizationId
    ? await prisma.organization.findUnique({ where: { id: result.property.organizationId }, select: { name: true } })
    : null;

  const sent: { tenantId: string; tenant: string; sentTo: string }[] = [];
  const failed: { tenantId: string; tenant: string; error: string }[] = [];
  for (const tenantId of tenantIds) {
    const row = result.statement.rows.find((r) => r.tenantId === tenantId);
    if (!row) {
      failed.push({ tenantId, tenant: "—", error: "Nothing unpaid for this tenant" });
      continue;
    }
    try {
      const r = await sendUtilityReminder(
        row,
        {
          propertyName: result.property.name,
          senderName: org?.name ?? result.property.name,
          currency: result.property.currency,
          organizationId: result.property.organizationId,
        },
        { email: session!.user.email ?? "unknown", name: session!.user.name ?? null },
      );
      sent.push({ tenantId, tenant: row.tenantName, sentTo: r.sentTo });
    } catch (e) {
      failed.push({ tenantId, tenant: row.tenantName, error: e instanceof Error ? e.message : "Send failed" });
    }
  }

  return Response.json({ sent: sent.length, failed: failed.length, sentDetails: sent, failedDetails: failed });
}
