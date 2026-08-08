import { requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  buildTenantStatement,
  resolveStatementPeriod,
  type StatementMode,
  type TenantStatement,
} from "@/lib/tenant-statement";

/**
 * Query parsing + guard chain shared by the manager statement routes
 * (JSON / PDF / send) so the three surfaces validate identically.
 */
export function parseStatementQuery(searchParams: URLSearchParams):
  | { ok: true; mode: StatementMode; year?: number; from?: Date; to?: Date }
  | { ok: false; error: string } {
  const modeRaw = searchParams.get("mode") ?? "lease-year";
  if (!["lease-year", "tenancy", "calendar-year", "custom"].includes(modeRaw)) {
    return { ok: false, error: "Invalid mode" };
  }
  const mode = modeRaw as StatementMode;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : undefined;
  if (searchParams.get("year") && (!year || year < 1970 || year > 2200)) {
    return { ok: false, error: "Invalid year" };
  }
  let from: Date | undefined;
  let to: Date | undefined;
  if (mode === "custom") {
    from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { ok: false, error: "Custom mode requires valid from and to dates (YYYY-MM-DD)" };
    }
  }
  return { ok: true, mode, year, from, to };
}

export type ManagerStatementResult =
  | { error: Response }
  | { noPeriod: Response }
  | { statement: TenantStatement; organizationId: string | null; tenantEmail: string | null; tenantName: string };

/** Guard chain: tenant exists → property access → LONGTERM only → period → build. */
export async function loadStatementForManager(
  tenantId: string,
  searchParams: URLSearchParams,
): Promise<ManagerStatementResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      leaseStart: true,
      leaseEnd: true,
      vacatedDate: true,
      unit: { select: { propertyId: true, property: { select: { type: true, organizationId: true } } } },
    },
  });
  if (!tenant) {
    return { error: Response.json({ error: "Tenant not found" }, { status: 404 }) };
  }

  const access = await requirePropertyAccess(tenant.unit.propertyId);
  if (!access.ok) return { error: access.error! };

  if (tenant.unit.property.type !== "LONGTERM") {
    return {
      error: Response.json(
        { error: "Statements are available for long-term rental properties only" },
        { status: 400 },
      ),
    };
  }

  const params = parseStatementQuery(searchParams);
  if (!params.ok) {
    return { error: Response.json({ error: params.error }, { status: 400 }) };
  }

  const resolved = resolveStatementPeriod(tenant, params);
  if (!resolved.ok) {
    // NO_PERIOD is a legitimate state (future lease, non-overlapping year) —
    // 200 with an explicit flag so the UI can explain it; INVALID_RANGE is a
    // caller error.
    if (resolved.code === "NO_PERIOD") {
      return { noPeriod: Response.json({ noPeriod: true, reason: resolved.reason }) };
    }
    return { error: Response.json({ error: resolved.reason }, { status: 400 }) };
  }

  const statement = await buildTenantStatement(tenantId, resolved.period);
  if (!statement) {
    return { error: Response.json({ error: "Tenant not found" }, { status: 404 }) };
  }
  return {
    statement,
    organizationId: tenant.unit.property.organizationId,
    tenantEmail: tenant.email,
    tenantName: tenant.name,
  };
}
