import { prisma } from "@/lib/prisma";
import { validatePortalToken } from "@/lib/portal-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildServiceChargeView, loadBudgetRecord } from "@/lib/service-charge-data";
import { generateServiceChargePdf } from "@/lib/service-charge-statement-pdf";

export const maxDuration = 30;

/**
 * GET /api/portal/[token]/service-charge[?budgetId=&format=pdf] — the
 * tenant's own service charge statements, only for budgets the manager has
 * PUBLISHED on the tenant's property, and only the tenant's own row (the PDF
 * is the tenant-mode statement). The token IS the scope.
 */
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const limit = rateLimit(`portal-service-charge:${getClientIp(req)}`, { max: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const qs = new URL(req.url).searchParams;
  const budgetId = qs.get("budgetId");
  if (budgetId) {
    const budget = await loadBudgetRecord(budgetId);
    if (!budget || !budget.publishedAt || budget.propertyId !== tenant.unit.propertyId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const view = await buildServiceChargeView(budget);
    if (!view.statement.rows.some((r) => r.tenantId === tenant.id)) return Response.json({ error: "Not found" }, { status: 404 });
    if (qs.get("format") !== "pdf") return Response.json({ error: "format=pdf required" }, { status: 400 });
    const pdf = await generateServiceChargePdf({ view, tenantId: tenant.id });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // Header values are ByteStrings: the period label has an en dash.
        "Content-Disposition": `attachment; filename="${`Service charge statement ${view.period.label}.pdf`.replace(/[^\w .-]/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const published = await prisma.serviceChargeBudget.findMany({
    where: { propertyId: tenant.unit.propertyId, publishedAt: { not: null } },
    orderBy: { year: "desc" },
    take: 3,
    select: { id: true },
  });
  const statements = [];
  for (const b of published) {
    const record = await loadBudgetRecord(b.id);
    if (!record) continue;
    const view = await buildServiceChargeView(record);
    const row = view.statement.rows.find((r) => r.tenantId === tenant.id);
    if (!row) continue;
    statements.push({
      budgetId: b.id,
      label: view.period.label,
      yearEnded: view.statement.yearEnded,
      share: row.share,
      billed: row.billed,
      balance: row.balance,
      currency: view.property.currency,
    });
  }
  return Response.json({ statements });
}
