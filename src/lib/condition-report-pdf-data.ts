import "server-only";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";
import { normaliseKeys } from "@/lib/inspection-rules";
import { generateConditionReportPdf, type ConditionPdfItem, type ConditionPdfPhoto } from "@/lib/move-in-report-pdf";

type StoredReading = { label?: string; reading?: number; lastReading?: number | null };

/**
 * Renders a condition report's PDF from the database — shared by the
 * download route, acceptance (vaulting) and the email to the tenant.
 * Returns null when the report does not exist.
 */
export async function buildConditionReportPdf(reportId: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const report = await prisma.conditionReport.findUnique({
    where: { id: reportId },
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
  if (!report) return null;

  const items = (report.items as unknown as ConditionPdfItem[]) ?? [];
  const photoOwners = new Map<string, ConditionPdfItem>();
  for (const it of items) for (const pid of it.photoIds ?? []) photoOwners.set(pid, it);

  const pdfPhotos: ConditionPdfPhoto[] = [];
  for (const p of report.photos) {
    let url: string | null = null;
    try { url = await getSignedUrl(p.storagePath, 3600); } catch { /* skip */ }
    if (!url) continue;
    const owner = photoOwners.get(p.id);
    pdfPhotos.push({ id: p.id, url, caption: owner ? `${owner.room} — ${owner.feature}` : p.fileName, note: owner?.notes || null });
  }

  let signatureUrl: string | null = null;
  if (report.tenantSignaturePath) {
    try { signatureUrl = await getSignedUrl(report.tenantSignaturePath, 3600); } catch { /* render without */ }
  }

  const org = report.property.organization;
  const buffer = await generateConditionReportPdf({
    org: {
      name: org?.name ?? report.property.name,
      logoUrl: org?.logoUrl ?? report.property.logoUrl ?? null,
      address: org?.address ?? report.property.address ?? null,
    },
    property: { name: report.property.name, address: report.property.address, currency: report.property.currency },
    unit: { unitNumber: report.unit.unitNumber, type: report.unit.type },
    tenant: report.tenant,
    report: {
      reportType: report.reportType,
      reportDate: report.reportDate,
      items,
      overallComments: report.overallComments,
      signedByTenant: report.signedByTenant,
      signedByManager: report.signedByManager,
      inspectorName: report.submittedByName,
      keys: normaliseKeys(report.keys),
      meterReadings: Array.isArray(report.meterReadings)
        ? (report.meterReadings as StoredReading[]).filter((r) => r && typeof r.reading === "number").map((r) => ({ label: String(r.label ?? "Meter"), reading: r.reading!, lastReading: r.lastReading ?? null }))
        : [],
      tenantIssues: report.tenantIssues,
      tenantSignOff: report.tenantSignOff,
      tenantSignedName: report.tenantSignedName,
      tenantSignedAt: report.tenantSignedAt,
      tenantSignatureUrl: signatureUrl,
      tenantDisagrees: report.tenantDisagrees,
      tenantComments: report.tenantComments,
    },
    photos: pdfPhotos,
  });

  const fileName = `condition-report-${report.unit.unitNumber}-${report.reportType.toLowerCase().replace("_", "-")}.pdf`;
  return { buffer, fileName };
}
