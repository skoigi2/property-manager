import { validatePortalToken } from "@/lib/portal-auth";
import { buildTenantStatement, resolveStatementPeriod } from "@/lib/tenant-statement";
import { parseStatementQuery } from "@/lib/tenant-statement-request";

/**
 * Tenant-facing statement JSON. Read-only; the token IS the scope — the
 * statement is always the token's own tenant, so another tenant's data is
 * unreachable by construction.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (tenant.unit.property.type !== "LONGTERM") {
    return Response.json({ error: "Statements are not available for this property" }, { status: 404 });
  }

  const url = new URL(req.url);
  const parsed = parseStatementQuery(url.searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const resolved = resolveStatementPeriod(tenant, parsed);
  if (!resolved.ok) {
    if (resolved.code === "NO_PERIOD") {
      return Response.json({ noPeriod: true, reason: resolved.reason });
    }
    return Response.json({ error: resolved.reason }, { status: 400 });
  }

  const statement = await buildTenantStatement(tenant.id, resolved.period);
  if (!statement) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(statement);
}
