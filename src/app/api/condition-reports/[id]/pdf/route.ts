import "server-only";
import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";
import { generateConditionReportPdf, type ConditionPdfItem, type ConditionPdfPhoto } from "@/lib/move-in-report-pdf";

export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const report = await prisma.conditionReport.findUnique({
    where: { id: params.id },
    include: {
      unit: { select: { unitNumber: true, type: true } },
      property: {
        select: {
          name: true, address: true, currency: true, logoUrl: true,
          organization: { select: { name: true, logoUrl: true, address: true } },
        },
      },
      tenant: { select: { name: true, phone: true, email: true, leaseStart: true, leaseEnd: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(report.propertyId)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const items = (report.items as unknown as ConditionPdfItem[]) ?? [];

  // Resolve signed URLs and pair each photo with the item that owns it.
  const photoOwners = new Map<string, ConditionPdfItem>();
  for (const it of items) {
    for (const pid of it.photoIds ?? []) photoOwners.set(pid, it);
  }

  const pdfPhotos: ConditionPdfPhoto[] = [];
  for (const p of report.photos) {
    const owner = photoOwners.get(p.id);
    let url: string | null = null;
    try { url = await getSignedUrl(p.storagePath, 3600); } catch { /* skip if signing fails */ }
    if (!url) continue;
    pdfPhotos.push({
      id: p.id,
      url,
      caption: owner ? `${owner.room} — ${owner.feature}` : p.fileName,
      note: owner?.notes || null,
    });
  }

  const orgRecord = report.property.organization;

  const pdfBuffer = await generateConditionReportPdf({
    org: {
      name: orgRecord?.name ?? report.property.name,
      logoUrl: orgRecord?.logoUrl ?? report.property.logoUrl ?? null,
      address: orgRecord?.address ?? report.property.address ?? null,
    },
    property: {
      name: report.property.name,
      address: report.property.address,
      currency: report.property.currency,
    },
    unit: { unitNumber: report.unit.unitNumber, type: report.unit.type },
    tenant: report.tenant
      ? {
          name: report.tenant.name,
          phone: report.tenant.phone,
          email: report.tenant.email,
          leaseStart: report.tenant.leaseStart,
          leaseEnd: report.tenant.leaseEnd,
        }
      : null,
    report: {
      reportType: report.reportType,
      reportDate: report.reportDate,
      items,
      overallComments: report.overallComments,
      signedByTenant: report.signedByTenant,
      signedByManager: report.signedByManager,
    },
    photos: pdfPhotos,
  });

  const filename = `condition-report-${report.unit.unitNumber}-${report.reportType.toLowerCase()}.pdf`;
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
