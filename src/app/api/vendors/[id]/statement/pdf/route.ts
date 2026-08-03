export const maxDuration = 30;

import { prisma } from "@/lib/prisma";
import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildVendorStatement } from "@/lib/vendor-statement";
import { generateVendorStatementPdf } from "@/lib/vendor-statement-pdf";

const fmtRange = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// GET /api/vendors/[id]/statement/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
// Same scoping as the JSON statement route, rendered as a PDF attachment.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId ?? null;
  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    select: { organizationId: true },
  });
  if (!vendor) return Response.json({ error: "Not found" }, { status: 404 });
  if (orgId && vendor.organizationId !== null && vendor.organizationId !== orgId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : null;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    return Response.json({ error: "Invalid date range" }, { status: 400 });
  }

  const propertyIds = (await getAccessiblePropertyIds()) ?? [];
  const statement = await buildVendorStatement(params.id, { orgId, propertyIds }, from, to);
  if (!statement) return Response.json({ error: "Not found" }, { status: 404 });

  // Label from the raw YYYY-MM-DD params — `to` is shifted to end-of-day UTC
  // for filtering, which would render as the next local day.
  const periodLabel =
    from || to
      ? `${fromParam ? fmtRange(new Date(fromParam)) : "Start"} — ${toParam ? fmtRange(new Date(toParam)) : "Today"}`
      : "All history";

  const pdf = await generateVendorStatementPdf(statement, periodLabel);
  const safeName = statement.vendor.name.replace(/[^\w\- ]+/g, "").trim();
  // Header values must be ASCII (ByteString) — the em-dash stays in the PDF only.
  const fileLabel = periodLabel.replace(/—/g, "to");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Vendor Statement - ${safeName} - ${fileLabel}.pdf"`,
    },
  });
}
