import "server-only";
import { requireManager } from "@/lib/auth-utils";
import { loadStatementForManager } from "@/lib/tenant-statement-request";
import { getStatementBranding } from "@/lib/tenant-statement";
import { generateTenantStatementPdf } from "@/lib/tenant-statement-pdf";

export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const url = new URL(req.url);
  const result = await loadStatementForManager(params.id, url.searchParams);
  if ("error" in result) return result.error;
  if ("noPeriod" in result) return result.noPeriod;

  const { statement } = result;

  // The empty statement is the failure mode, not bad numbers: a blank PDF
  // reads as "you owe nothing / you paid nothing". Refuse to render it.
  if (statement.coverage.isEmpty) {
    return Response.json(
      { error: statement.coverage.emptyReason, code: "NO_RECORDS", coverage: statement.coverage },
      { status: 422 },
    );
  }

  const branding = await getStatementBranding(params.id);
  const pdf = await generateTenantStatementPdf(statement, branding);

  const safeName = statement.tenantName.replace(/[^\w\- ]+/g, "").trim() || "tenant";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Statement - ${safeName} - ${statement.period.label.replace(/[^\w\- ()]+/g, "")}.pdf"`,
    },
  });
}
