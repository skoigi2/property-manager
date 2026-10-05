import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  defaultTurnoverItems, normaliseTurnoverItems, effectiveTurnoverItems, turnoverProgress,
  type TurnoverItemKey, type RepairJobsState,
} from "@/lib/turnover";

// Prisma side of the "ready to re-let" checklist (pure rules: src/lib/turnover.ts).

/**
 * Starts the unit's checklist, or returns the open one (filling in the
 * inspection / checkout links it was missing). One open checklist per unit.
 */
export async function startTurnover(args: {
  unitId: string;
  propertyId: string;
  organizationId: string | null;
  tenantId?: string | null;
  conditionReportId?: string | null;
  checkoutId?: string | null;
  done?: Partial<Record<TurnoverItemKey, boolean>>;
  byName?: string | null;
}) {
  const open = await prisma.unitTurnover.findFirst({ where: { unitId: args.unitId, completedAt: null } });
  if (open) {
    const fill: Prisma.UnitTurnoverUncheckedUpdateInput = {};
    if (!open.conditionReportId && args.conditionReportId) fill.conditionReportId = args.conditionReportId;
    if (!open.checkoutId && args.checkoutId) fill.checkoutId = args.checkoutId;
    if (!open.tenantId && args.tenantId) fill.tenantId = args.tenantId;
    return Object.keys(fill).length ? prisma.unitTurnover.update({ where: { id: open.id }, data: fill }) : open;
  }
  return prisma.unitTurnover.create({
    data: {
      unitId: args.unitId,
      propertyId: args.propertyId,
      organizationId: args.organizationId,
      tenantId: args.tenantId ?? null,
      conditionReportId: args.conditionReportId ?? null,
      checkoutId: args.checkoutId ?? null,
      items: defaultTurnoverItems(args.done ?? {}, args.byName ?? null) as unknown as Prisma.InputJsonValue,
    },
  });
}

type TurnoverRow = Prisma.UnitTurnoverGetPayload<{
  include: { unit: { select: { id: true; unitNumber: true; status: true } }; property: { select: { id: true; name: true } } };
}>;

/** Repair jobs raised from the turnover's inspection, and whether its checkout settled the deposit. */
async function contextFor(rows: TurnoverRow[]) {
  const reportIds = rows.map((r) => r.conditionReportId).filter((x): x is string => !!x);
  const checkoutIds = rows.map((r) => r.checkoutId).filter((x): x is string => !!x);
  const tenantIds = rows.map((r) => r.tenantId).filter((x): x is string => !!x);
  const [jobs, checkouts, tenants] = await Promise.all([
    reportIds.length
      ? prisma.maintenanceJob.findMany({
          where: { conditionReportId: { in: reportIds } },
          select: { id: true, title: true, status: true, conditionReportId: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    checkoutIds.length
      ? prisma.checkoutProcess.findMany({ where: { id: { in: checkoutIds } }, select: { id: true, status: true } })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  return { jobs, checkouts, tenants };
}

export function serializeTurnovers(rows: TurnoverRow[], ctx: Awaited<ReturnType<typeof contextFor>>) {
  return rows.map((r) => {
    const jobs = ctx.jobs.filter((j) => r.conditionReportId && j.conditionReportId === r.conditionReportId);
    const repairs: RepairJobsState = { total: jobs.length, open: jobs.filter((j) => j.status !== "DONE" && j.status !== "CANCELLED").length };
    const depositSettled = ctx.checkouts.some((c) => c.id === r.checkoutId && c.status === "COMPLETED");
    const items = effectiveTurnoverItems(normaliseTurnoverItems(r.items), { repairs, depositSettled });
    return {
      id: r.id,
      unit: r.unit,
      property: r.property,
      tenantName: ctx.tenants.find((t) => t.id === r.tenantId)?.name ?? null,
      conditionReportId: r.conditionReportId,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      completedByName: r.completedByName,
      items,
      progress: turnoverProgress(items),
      repairs,
      depositSettled,
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, status: j.status })),
    };
  });
}

const INCLUDE = {
  unit: { select: { id: true, unitNumber: true, status: true } },
  property: { select: { id: true, name: true } },
} as const;

export async function listTurnovers(propertyIds: string[], view: "open" | "done") {
  const rows = await prisma.unitTurnover.findMany({
    where: { propertyId: { in: propertyIds }, completedAt: view === "open" ? null : { not: null } },
    include: INCLUDE,
    orderBy: view === "open" ? { startedAt: "asc" } : { completedAt: "desc" },
    take: 200,
  });
  return serializeTurnovers(rows, await contextFor(rows));
}

export async function loadTurnover(id: string) {
  const row = await prisma.unitTurnover.findUnique({ where: { id }, include: INCLUDE });
  if (!row) return null;
  return { row, view: serializeTurnovers([row], await contextFor([row]))[0] };
}
