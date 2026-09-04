import { requireSession, requireOpsStaffWrite, requireManagerWrite, isSuperAdminSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { complaintActionSchema } from "@/lib/validations";
import { COMPLAINT_INCLUDE, complaintToDto, applyComplaintAction, loadComplaintForSession } from "@/lib/complaints";
import { loadCaseTimeline } from "@/lib/case-events";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const loaded = await loadComplaintForSession(params.id, session!);
  if (loaded.error) return loaded.error;

  const events = loaded.complaint.caseThreadId ? await loadCaseTimeline(loaded.complaint.caseThreadId) : [];
  return Response.json({ ...complaintToDto(loaded.complaint), events });
}

/** PATCH { action, note? } — acknowledge / investigate / await_tenant / resolve (ops staff), reopen / close (managers). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const loaded = await loadComplaintForSession(params.id, session!);
  if (loaded.error) return loaded.error;

  const parsed = complaintActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await applyComplaintAction({
    complaint: loaded.complaint,
    action: parsed.data.action,
    note: parsed.data.note,
    orgRole: session!.user.orgRole,
    isSuperAdmin: isSuperAdminSession(session!),
    actor: { userId: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null },
  });
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });

  const fresh = await prisma.tenantComplaint.findUniqueOrThrow({ where: { id: params.id }, include: COMPLAINT_INCLUDE });
  return Response.json(complaintToDto(fresh));
}

/** DELETE — manager tier only. Removes the complaint and its case (events cascade). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const loaded = await loadComplaintForSession(params.id, session!);
  if (loaded.error) return loaded.error;
  const c = loaded.complaint;

  await prisma.$transaction([
    prisma.tenantComplaint.delete({ where: { id: c.id } }),
    ...(c.caseThreadId ? [prisma.caseThread.delete({ where: { id: c.caseThreadId } })] : []),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "TenantComplaint",
    resourceId: c.id,
    organizationId: c.organizationId,
    before: { title: c.title, category: c.category, source: c.source, caseThreadId: c.caseThreadId },
  });

  return Response.json({ success: true });
}
