import { requireSession, requireOpsStaffWrite, requirePropertyAccess, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createComplaintSchema, COMPLAINT_CATEGORIES } from "@/lib/validations";
import { COMPLAINT_INCLUDE, complaintToDto, complaintCategoryFilter, createComplaint } from "@/lib/complaints";
import { complaintVisibleTo } from "@/lib/complaint-rules";
import { notifyNewComplaint } from "@/lib/complaint-notify";

const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VENDOR", "AWAITING_TENANT", "RESOLVED", "CLOSED"] as const;

/**
 * GET /api/complaints?propertyId=&status=&category=&mine=true&open=true
 * Any role incl. CARETAKER — scoped by accessible properties; categories the
 * role must not see are excluded in the query (STAFF_CONDUCT for caretakers).
 */
export async function GET(req: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const orgRole = session!.user.orgRole;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const mine = searchParams.get("mine") === "true";
  const openOnly = searchParams.get("open") === "true";
  const effectiveIds = propertyId && propertyIds.includes(propertyId) ? [propertyId] : propertyIds;

  const rows = await prisma.tenantComplaint.findMany({
    where: {
      propertyId: { in: effectiveIds },
      ...complaintCategoryFilter(orgRole),
      ...(category && (COMPLAINT_CATEGORIES as readonly string[]).includes(category) && complaintVisibleTo(orgRole, category)
        ? { category: category as (typeof COMPLAINT_CATEGORIES)[number] }
        : {}),
      ...(mine ? { raisedByUserId: session!.user.id } : {}),
      ...(status && (CASE_STATUSES as readonly string[]).includes(status)
        ? { caseThread: { status: status as (typeof CASE_STATUSES)[number] } }
        : {}),
      ...(openOnly ? { caseThread: { status: { notIn: ["RESOLVED", "CLOSED"] } } } : {}),
    },
    include: COMPLAINT_INCLUDE,
    orderBy: [{ caseThread: { lastActivityAt: "desc" } }, { createdAt: "desc" }],
    take: 500,
  });

  return Response.json(rows.map(complaintToDto));
}

/**
 * POST /api/complaints — ops staff incl. CARETAKER. Creates the complaint and
 * its COMPLAINT case, then emails the property's managers.
 */
export async function POST(req: Request) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const orgRole = session!.user.orgRole;

  const parsed = createComplaintSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  // STAFF_CONDUCT is manager-only end to end (the caretaker may be the subject).
  if (!complaintVisibleTo(orgRole, data.category)) {
    return Response.json({ error: "That category can only be logged by a manager.", code: "CATEGORY_NOT_ALLOWED" }, { status: 403 });
  }

  const access = await requirePropertyAccess(data.propertyId);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({ where: { id: data.propertyId }, select: { organizationId: true } });
  if (!property?.organizationId) return Response.json({ error: "Property has no organisation" }, { status: 400 });

  // Resolve + validate the tenant / units against the property.
  let unitId = data.unitId || null;
  if (data.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { id: true, isActive: true, unitId: true, unit: { select: { propertyId: true } } },
    });
    if (!tenant || !tenant.isActive || tenant.unit.propertyId !== data.propertyId) {
      return Response.json({ error: "Tenant is not an active tenant of this property." }, { status: 400 });
    }
    unitId = unitId ?? tenant.unitId;
  }
  for (const [label, id] of [["Unit", unitId], ["Unit concerned", data.subjectUnitId || null]] as const) {
    if (!id) continue;
    const unit = await prisma.unit.findUnique({ where: { id }, select: { propertyId: true } });
    if (!unit || unit.propertyId !== data.propertyId) {
      return Response.json({ error: `${label} does not belong to this property.` }, { status: 400 });
    }
  }

  const complaint = await createComplaint({
    propertyId: data.propertyId,
    organizationId: property.organizationId,
    unitId,
    tenantId: data.tenantId || null,
    subjectUnitId: data.subjectUnitId || null,
    category: data.category,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    source: "STAFF",
    raisedByUserId: session!.user.id,
    raisedByName: session!.user.name ?? session!.user.email ?? "Staff",
    actor: { userId: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null },
  });

  void notifyNewComplaint(complaint.id);

  return Response.json(complaintToDto(complaint), { status: 201 });
}
