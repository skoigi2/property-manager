export const maxDuration = 30;

import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildOwnerStatements } from "@/lib/owner-statement";
import { generateOwnerStatementPdf } from "@/lib/owner-statement-pdf";

/**
 * GET /api/report/owner-statement/pdf?propertyId=&year=&month=
 * Renders the owner statement PDF for one property/month — the same document
 * the OWNER_MONTHLY_REPORT automation attaches to its email.
 */
export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  if (!propertyId || !propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [statement] = await buildOwnerStatements([propertyId], year, month);
  if (!statement) return Response.json({ error: "Not found" }, { status: 404 });

  const pdf = await generateOwnerStatementPdf(statement);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Owner Statement - ${statement.propertyName} - ${statement.period}.pdf"`,
    },
  });
}
