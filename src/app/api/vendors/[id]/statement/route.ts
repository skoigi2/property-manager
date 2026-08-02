import { prisma } from "@/lib/prisma";
import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildVendorStatement } from "@/lib/vendor-statement";

// GET /api/vendors/[id]/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
// Computed on the fly (never stored) — invoices + payments merged into a
// running-balance ledger, scoped by org + accessible properties.
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

  return Response.json(statement);
}
