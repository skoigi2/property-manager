import { authorizeBudget } from "@/lib/service-charge-access";
import { buildServiceChargeView } from "@/lib/service-charge-data";
import { generateServiceChargePdf } from "@/lib/service-charge-statement-pdf";

export const maxDuration = 30;

// Service charge statement PDF: the whole block, or one tenant (?tenantId=).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeBudget(params.id);
  if (auth.error) return auth.error;
  const tenantId = new URL(req.url).searchParams.get("tenantId") ?? undefined;
  const view = await buildServiceChargeView(auth.budget);
  const row = tenantId ? view.statement.rows.find((r) => r.tenantId === tenantId) : null;
  if (tenantId && !row) return Response.json({ error: "That tenant has no share in this period." }, { status: 404 });

  const pdf = await generateServiceChargePdf({ view, tenantId });
  const who = row ? ` - Unit ${row.unitNumber}` : "";
  const file = `Service charge statement ${view.period.label} - ${view.property.name}${who}.pdf`.replace(/[^\w .-]/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
