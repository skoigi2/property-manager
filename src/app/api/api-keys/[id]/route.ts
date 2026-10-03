import { requireAdminWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/** DELETE /api/api-keys/[id] — revoke (soft) so the audit trail keeps the row. */
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireAdminWrite();
  if (error) return error;
  const orgId = session!.user.organizationId;

  const key = await prisma.apiKey.findUnique({ where: { id: params.id } });
  if (!key || (orgId && key.organizationId !== orgId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? null,
    action: "DELETE",
    resource: "ApiKey",
    resourceId: key.id,
    before: { name: key.name, keyPrefix: key.keyPrefix },
  });

  return Response.json({ ok: true });
}
