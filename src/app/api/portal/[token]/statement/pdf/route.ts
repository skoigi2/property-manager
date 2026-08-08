import "server-only";
import { validatePortalToken } from "@/lib/portal-auth";
import {
  buildTenantStatement,
  getStatementBranding,
  resolveStatementPeriod,
} from "@/lib/tenant-statement";
import { parseStatementQuery } from "@/lib/tenant-statement-request";
import { generateTenantStatementPdf } from "@/lib/tenant-statement-pdf";

export const maxDuration = 30;

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
    return Response.json({ error: resolved.reason }, { status: resolved.code === "NO_PERIOD" ? 404 : 400 });
  }

  const statement = await buildTenantStatement(tenant.id, resolved.period);
  if (!statement) return Response.json({ error: "Not found" }, { status: 404 });

  // Same refusal as the manager PDF: a blank statement reads as "no rent was
  // ever recorded", which alarms tenants on legacy-data properties.
  if (statement.coverage.isEmpty) {
    return Response.json(
      { error: "No records are available for this period yet. Please contact your property manager.", code: "NO_RECORDS" },
      { status: 422 },
    );
  }

  const branding = await getStatementBranding(tenant.id);
  const pdf = await generateTenantStatementPdf(statement, branding);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Statement - ${statement.period.label.replace(/[^\w\- ()]+/g, "")}.pdf"`,
    },
  });
}
