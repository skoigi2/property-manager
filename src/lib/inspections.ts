import "server-only";
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, isSuperAdminSession, MANAGER_ROLES, isRoleAllowed } from "@/lib/auth-utils";
import { getSignedUrl } from "@/lib/supabase-storage";
import { seedItemsFromTemplate } from "@/lib/condition-report-template";
import { normaliseKeys, keysState, type InspectionItem, type InspectionType } from "@/lib/inspection-rules";
import { tenantMoneySummary, caretakersSeeMoney } from "@/lib/tenant-money";

// Server side of inspection visits (condition reports run on site). Pure rules
// live in src/lib/inspection-rules.ts.

export type ServiceError = { ok: false; status: number; error: string };
export const fail = (status: number, error: string): ServiceError => ({ ok: false, status, error });

/** Manager tier (ADMIN / MANAGER / ACCOUNTANT, or a super-admin) reviews inspections. */
export function isInspectionManager(session: Session): boolean {
  return isRoleAllowed(session.user.orgRole, MANAGER_ROLES, isSuperAdminSession(session));
}

export const INSPECTION_INCLUDE = {
  unit: { select: { id: true, unitNumber: true, type: true } },
  property: { select: { id: true, name: true, organizationId: true } },
  tenant: {
    select: {
      id: true, name: true, phone: true, email: true, leaseStart: true, leaseEnd: true, nationalId: true,
    },
  },
  assignedTo: { select: { id: true, name: true, email: true } },
  photos: { orderBy: { uploadedAt: "asc" as const } },
} satisfies Prisma.ConditionReportInclude;

export type InspectionRecord = Prisma.ConditionReportGetPayload<{ include: typeof INSPECTION_INCLUDE }>;

/** Loads an inspection the session may see (404 for anything outside its properties). */
export async function loadInspection(id: string): Promise<{ ok: true; report: InspectionRecord } | ServiceError> {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return fail(401, "Unauthorized");
  const report = await prisma.conditionReport.findUnique({ where: { id }, include: INSPECTION_INCLUDE });
  if (!report || !propertyIds.includes(report.propertyId)) return fail(404, "Inspection not found");
  return { ok: true, report };
}

async function signedOrNull(path: string | null): Promise<string | null> {
  if (!path) return null;
  try { return await getSignedUrl(path); } catch { return null; }
}

/**
 * The inspection as the client sees it. Caretakers get the tenant's name,
 * phone, lease start and ID number (what they need on site) — never email or
 * lease end; managers get the lot. A move-out / mid-term carries the tenant's
 * accepted move-in report as `baseline` to compare against.
 */
export async function serializeInspection(report: InspectionRecord, session: Session) {
  const manager = isInspectionManager(session);
  const photos = await Promise.all(report.photos.map(async (p) => ({
    id: p.id, fileName: p.fileName, uploadedAt: p.uploadedAt, url: await signedOrNull(p.storagePath),
  })));

  let baseline: { id: string; reportDate: Date; items: InspectionItem[]; photos: { id: string; url: string | null }[] } | null = null;
  if (report.reportType !== "MOVE_IN") {
    const base = await prisma.conditionReport.findFirst({
      where: {
        id: { not: report.id },
        unitId: report.unitId,
        reportType: "MOVE_IN",
        status: "ACCEPTED",
        ...(report.tenantId ? { tenantId: report.tenantId } : {}),
      },
      orderBy: { reportDate: "desc" },
      include: { photos: { orderBy: { uploadedAt: "asc" } } },
    });
    if (base) {
      baseline = {
        id: base.id,
        reportDate: base.reportDate,
        items: (base.items as unknown as InspectionItem[]) ?? [],
        photos: await Promise.all(base.photos.map(async (p) => ({ id: p.id, url: await signedOrNull(p.storagePath) }))),
      };
    }
  }

  // Rent, Wi-Fi, deposit and balances: managers always; caretakers only when
  // the organisation allows it (Organization.caretakersSeeTenantMoney).
  const showMoney = !!report.tenantId && (manager || (await caretakersSeeMoney(report.property.organizationId)));
  const tenantMoney = showMoney ? await tenantMoneySummary(report.tenantId!) : null;

  const t = report.tenant;
  return {
    id: report.id,
    reportType: report.reportType,
    status: report.status,
    reportDate: report.reportDate,
    scheduledFor: report.scheduledFor,
    unit: report.unit,
    property: { id: report.property.id, name: report.property.name },
    tenant: t
      ? manager
        ? t
        : { id: t.id, name: t.name, phone: t.phone, leaseStart: t.leaseStart, nationalId: t.nationalId }
      : null,
    assignedTo: report.assignedTo ? { id: report.assignedTo.id, name: report.assignedTo.name ?? report.assignedTo.email } : null,
    items: (report.items as unknown as InspectionItem[]) ?? [],
    overallComments: report.overallComments,
    tenantIssues: report.tenantIssues,
    keys: normaliseKeys(report.keys),
    keysState: keysState({ reportType: report.reportType, status: report.status, keysClearedAt: report.keysClearedAt }),
    keysClearedAt: report.keysClearedAt,
    tenantSignOff: report.tenantSignOff,
    tenantSignedName: report.tenantSignedName,
    tenantSignedAt: report.tenantSignedAt,
    tenantSignatureUrl: await signedOrNull(report.tenantSignaturePath),
    tenantDisagrees: report.tenantDisagrees,
    tenantComments: report.tenantComments,
    submittedAt: report.submittedAt,
    submittedByName: report.submittedByName,
    acceptedAt: report.acceptedAt,
    reviewNote: report.reviewNote,
    editRequestedAt: report.editRequestedAt,
    editRequestReason: report.editRequestReason,
    sentToTenantAt: report.sentToTenantAt,
    vaulted: !!report.tenantDocumentId,
    photos,
    baseline,
    tenantMoney,
    viewer: { isManager: manager, userId: session.user.id },
  };
}

/**
 * People an inspection on this property may be assigned to: the org's ADMIN
 * members, plus MANAGER / ACCOUNTANT / CARETAKER members with access to the
 * property. Keyed on the membership role (see manager-recipients.ts).
 */
export function assigneeWhere(propertyId: string, organizationId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    OR: [
      { organizationMemberships: { some: { organizationId, role: "ADMIN" } } },
      {
        organizationMemberships: { some: { organizationId, role: { in: ["MANAGER", "ACCOUNTANT", "CARETAKER"] } } },
        propertyAccess: { some: { propertyId } },
      },
    ],
  };
}

export async function listAssignees(propertyId: string, organizationId: string) {
  const users = await prisma.user.findMany({
    where: assigneeWhere(propertyId, organizationId),
    select: { id: true, name: true, email: true, organizationMemberships: { where: { organizationId }, select: { role: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? "Unnamed", role: u.organizationMemberships[0]?.role ?? null }));
}

/** Checks an assignee for a property; a caretaker may only assign themselves. */
export async function checkAssignee(
  userId: string,
  property: { id: string; organizationId: string | null },
  session: Session,
): Promise<ServiceError | null> {
  if (!isInspectionManager(session) && userId !== session.user.id) {
    return fail(403, "Only a manager can assign an inspection to someone else.");
  }
  if (!property.organizationId) return fail(400, "This property has no organisation.");
  const ok = await prisma.user.count({ where: { id: userId, ...assigneeWhere(property.id, property.organizationId) } });
  return ok ? null : fail(400, "That person can't be assigned to this property.");
}

export type CreateInspectionInput = {
  unitId: string;
  reportType: InspectionType;
  scheduledFor?: string | null;
  assignedToUserId?: string | null;
  tenantId?: string | null;
};

export async function createInspection(input: CreateInspectionInput, session: Session) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return fail(401, "Unauthorized");
  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: {
      id: true, propertyId: true,
      property: { select: { id: true, organizationId: true } },
      tenants: { where: { isActive: true }, select: { id: true }, orderBy: { leaseStart: "desc" }, take: 1 },
    },
  });
  if (!unit || !propertyIds.includes(unit.propertyId)) return fail(404, "Unit not found");

  // Default to the unit's current tenant (a mid-term on a vacant unit has none).
  const tenantId: string | null = input.tenantId ?? unit.tenants[0]?.id ?? null;
  if (input.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { unitId: true } });
    if (!t || t.unitId !== unit.id) return fail(400, "That tenant is not on this unit.");
  }
  if ((input.reportType === "MOVE_IN" || input.reportType === "MOVE_OUT") && !tenantId) {
    return fail(400, "Add the tenant to this unit first — a move-in or move-out inspection needs one.");
  }

  // A caretaker's own inspection is theirs by default; a manager may leave it unassigned.
  const assignee = input.assignedToUserId === undefined
    ? (isInspectionManager(session) ? null : session.user.id)
    : input.assignedToUserId;
  if (assignee) {
    const bad = await checkAssignee(assignee, unit.property, session);
    if (bad) return bad;
  }

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return fail(400, "Invalid date and time.");

  const report = await prisma.conditionReport.create({
    data: {
      unitId: unit.id,
      propertyId: unit.propertyId,
      organizationId: unit.property.organizationId,
      tenantId,
      reportType: input.reportType,
      reportDate: scheduledFor ?? new Date(),
      scheduledFor,
      status: "SCHEDULED",
      assignedToUserId: assignee,
      createdByUserId: session.user.id,
      items: seedItemsFromTemplate() as unknown as Prisma.InputJsonValue,
    },
    include: INSPECTION_INCLUDE,
  });
  return { ok: true as const, report };
}

export type InspectionListFilter = {
  view?: "open" | "review" | "done" | "all";
  mine?: boolean;
  propertyId?: string | null;
  tenantId?: string | null;
};

export async function listInspections(filter: InspectionListFilter, session: Session) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return [];
  const scope = filter.propertyId ? propertyIds.filter((id) => id === filter.propertyId) : propertyIds;
  const where: Prisma.ConditionReportWhereInput = { propertyId: { in: scope } };
  if (filter.tenantId) where.tenantId = filter.tenantId;
  if (filter.mine) where.assignedToUserId = session.user.id;
  if (filter.view === "open") where.status = { in: ["SCHEDULED", "IN_PROGRESS"] };
  if (filter.view === "review") where.OR = [{ status: "SUBMITTED" }, { editRequestedAt: { not: null } }];
  if (filter.view === "done") where.status = "ACCEPTED";

  const rows = await prisma.conditionReport.findMany({
    where,
    orderBy: filter.view === "done" ? [{ acceptedAt: "desc" }] : [{ scheduledFor: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true, reportType: true, status: true, scheduledFor: true, reportDate: true, createdAt: true,
      submittedAt: true, acceptedAt: true, editRequestedAt: true, keysClearedAt: true, sentToTenantAt: true,
      unit: { select: { id: true, unitNumber: true } },
      property: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    assignedTo: r.assignedTo ? { id: r.assignedTo.id, name: r.assignedTo.name ?? r.assignedTo.email } : null,
    keysWaiting: r.reportType === "MOVE_IN" && !r.keysClearedAt && r.status !== "ACCEPTED",
  }));
}

/** The submit-check input for a loaded inspection. */
export function submitInputFor(report: InspectionRecord): import("@/lib/inspection-rules").SubmitInput {
  return {
    reportType: report.reportType,
    status: report.status,
    hasTenant: !!report.tenantId,
    items: (report.items as unknown as InspectionItem[]) ?? [],
    photoIds: new Set(report.photos.map((p) => p.id)),
    tenantSignOff: report.tenantSignOff,
    tenantSignedName: report.tenantSignedName,
    tenantSignaturePath: report.tenantSignaturePath,
  };
}

/** Hands the inspection in: findings lock, the inspector is recorded. */
export async function markSubmitted(report: InspectionRecord, session: Session) {
  return prisma.conditionReport.update({
    where: { id: report.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedByUserId: session.user.id,
      submittedByName: session.user.name ?? session.user.email ?? null,
      signedByTenant: report.tenantSignOff === "SIGNED",
      reviewNote: null,
      editRequestedAt: null,
      editRequestedByUserId: null,
      editRequestReason: null,
    },
    include: INSPECTION_INCLUDE,
  });
}
