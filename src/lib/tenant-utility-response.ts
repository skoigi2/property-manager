import "server-only";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";
import { loadTenantUtilityView } from "@/lib/utility-statement-data";
import { generateUtilityStatementPdf } from "@/lib/utility-statement-pdf";

/**
 * Shared response builder for a tenant's water & electricity view — used by
 * GET /api/tenants/[id]/utilities (manager) and
 * GET /api/portal/[token]/utilities (the tenant, token-scoped). Callers do
 * their own auth; this only ever reads the given tenant's APPROVED readings.
 */
export async function tenantUtilitiesResponse(tenantId: string, format: string | null): Promise<Response> {
  const view = await loadTenantUtilityView(tenantId);
  if (!view) return Response.json({ error: "Not found" }, { status: 404 });

  if (format === "pdf") {
    const org = view.property.organizationId
      ? await prisma.organization.findUnique({ where: { id: view.property.organizationId }, select: { name: true } })
      : null;
    const pdf = await generateUtilityStatementPdf({
      propertyName: view.property.name,
      orgName: org?.name ?? null,
      currency: view.property.currency,
      rangeLabel: "All readings",
      statement: view.statement,
      tenant: { row: view.summary, name: view.tenant.name, unitNumber: view.tenant.unitNumber, readings: view.readings },
    });
    const fileName = `Utility statement - ${view.tenant.name.replace(/[^\w\- ]+/g, "").trim() || "tenant"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` },
    });
  }

  // Sign the meter photos (1 h); a missing object never fails the response.
  const readings = await Promise.all(
    view.readings.map(async ({ photoPaths, ...r }) => {
      const photoUrls: string[] = [];
      for (const p of photoPaths) {
        try { photoUrls.push(await getSignedUrl(p, 3600)); } catch { /* skip */ }
      }
      return { ...r, photoUrls };
    }),
  );

  const zero = { billed: 0, paid: 0, unpaid: 0 };
  return Response.json({
    currency: view.property.currency,
    water: view.summary?.water ?? zero,
    electricity: view.summary?.electricity ?? zero,
    totalUnpaid: view.summary?.totalUnpaid ?? 0,
    notYetInvoiced: view.summary?.notYetInvoiced ?? 0,
    readings,
  });
}
