import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { loadUtilityStatement } from "@/lib/utility-statement-data";
import { parsePeriod, periodLabel } from "@/lib/utility-statement";
import { generateUtilityStatementPdf } from "@/lib/utility-statement-pdf";

export const maxDuration = 30;

/**
 * GET /api/utilities/statement?propertyId=&from=YYYY-MM&to=YYYY-MM&unpaidOnly=true&format=pdf
 * Manager tier. The whole property's water & electricity position — billed,
 * paid and unpaid per tenant, by invoice month — for chasing. `from` / `to`
 * are optional (omit both for all history). `format=pdf` returns the PDF.
 */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = parsePeriod(fromRaw);
  const to = parsePeriod(toRaw);
  if ((fromRaw && !from) || (toRaw && !to)) {
    return Response.json({ error: "Months must be given as YYYY-MM" }, { status: 400 });
  }

  const result = await loadUtilityStatement({
    propertyId,
    range: { from, to },
    unpaidOnly: searchParams.get("unpaidOnly") === "true",
  });
  if (!result) return Response.json({ error: "Property not found" }, { status: 404 });

  const rangeLabel =
    from && to ? `${periodLabel(fromRaw)} – ${periodLabel(toRaw)}` : from ? `From ${periodLabel(fromRaw)}` : to ? `Up to ${periodLabel(toRaw)}` : "All invoices";

  if (searchParams.get("format") === "pdf") {
    const org = result.property.organizationId
      ? await prisma.organization.findUnique({ where: { id: result.property.organizationId }, select: { name: true } })
      : null;
    const pdf = await generateUtilityStatementPdf({
      propertyName: result.property.name,
      orgName: org?.name ?? null,
      currency: result.property.currency,
      rangeLabel,
      statement: result.statement,
    });
    const fileName = `Utility statement - ${result.property.name.replace(/[^\w\- ]+/g, "").trim() || "property"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` },
    });
  }

  return Response.json({
    property: { id: result.property.id, name: result.property.name, currency: result.property.currency },
    rangeLabel,
    ...result.statement,
  });
}
