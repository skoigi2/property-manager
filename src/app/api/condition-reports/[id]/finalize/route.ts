import "server-only";
import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { logAudit } from "@/lib/audit";
import { generateConditionReportPdf, type ConditionPdfItem, type ConditionPdfPhoto } from "@/lib/move-in-report-pdf";
import { format } from "date-fns";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
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
      tenant: { select: { id: true, name: true, phone: true, email: true, leaseStart: true, leaseEnd: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(report.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (report.tenantDocumentId) {
    return Response.json(
      { error: "Already finalized", tenantDocumentId: report.tenantDocumentId },
      { status: 409 }
    );
  }
  // MOVE_IN / MOVE_OUT must have a tenant to vault to.
  if ((report.reportType === "MOVE_IN" || report.reportType === "MOVE_OUT") && !report.tenant) {
    return Response.json(
      { error: "MOVE_IN / MOVE_OUT reports must be linked to a tenant before finalising" },
      { status: 400 }
    );
  }

  const items = (report.items as unknown as ConditionPdfItem[]) ?? [];

  // Build photo set with signed URLs + captions
  const photoOwners = new Map<string, ConditionPdfItem>();
  for (const it of items) for (const pid of it.photoIds ?? []) photoOwners.set(pid, it);

  const pdfPhotos: ConditionPdfPhoto[] = [];
  for (const p of report.photos) {
    let url: string | null = null;
    try { url = await getSignedUrl(p.storagePath, 3600); } catch { /* skip */ }
    if (!url) continue;
    const owner = photoOwners.get(p.id);
    pdfPhotos.push({
      id: p.id,
      url,
      caption: owner ? `${owner.room} — ${owner.feature}` : p.fileName,
      note: owner?.notes || null,
    });
  }

  const orgRecord = report.property.organization;

  // 1. Generate the PDF
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

  // 2. Upload to vault (only when tenant present)
  if (!report.tenant) {
    // MID_TERM with no tenant — just mark generated and return; nothing to vault.
    await prisma.conditionReport.update({
      where: { id: report.id },
      data: { pdfGeneratedAt: new Date() },
    });
    return Response.json({ ok: true, vaulted: false });
  }

  const tenantId = report.tenant.id;
  const dateStr = format(report.reportDate, "yyyy-MM-dd");
  const fileName = `condition-report-${report.reportType.toLowerCase()}-${dateStr}.pdf`;
  const storagePath = `tenants/${tenantId}/${Date.now()}-${fileName}`;

  try {
    await uploadToStorage(storagePath, pdfBuffer, "application/pdf");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return Response.json({ error: `Vault upload failed: ${msg}` }, { status: 500 });
  }

  // 3. Create TenantDocument + update report — atomically
  const labelType =
    report.reportType === "MOVE_IN" ? "Move-In Condition Report"
    : report.reportType === "MOVE_OUT" ? "Move-Out Condition Report"
    : "Mid-Term Condition Report";

  const [doc] = await prisma.$transaction([
    prisma.tenantDocument.create({
      data: {
        tenantId,
        category: "CONDITION_REPORT",
        label: `${labelType} — ${format(report.reportDate, "d MMM yyyy")}`,
        fileName,
        storagePath,
        fileSize: pdfBuffer.length,
        mimeType: "application/pdf",
      },
    }),
    prisma.conditionReport.update({
      where: { id: report.id },
      data: { pdfGeneratedAt: new Date() },
    }),
  ]);

  // Set tenantDocumentId once we have it
  await prisma.conditionReport.update({
    where: { id: report.id },
    data: { tenantDocumentId: doc.id },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: session!.user.organizationId,
    after: {
      reportType: report.reportType,
      tenantId,
      unitId: report.unitId,
      tenantDocumentId: doc.id,
      photos: report.photos.length,
    },
  });

  return Response.json({ ok: true, vaulted: true, tenantDocumentId: doc.id });
}
