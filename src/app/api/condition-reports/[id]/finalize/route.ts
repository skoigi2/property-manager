import "server-only";
import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/supabase-storage";
import { logAudit } from "@/lib/audit";
import { buildConditionReportPdf } from "@/lib/condition-report-pdf-data";
import { loadInspection, loadUnitMeters, markSubmitted, serializeInspection, submitInputFor, INSPECTION_INCLUDE } from "@/lib/inspections";
import { submitProblems, canEditObservations } from "@/lib/inspection-rules";
import { format } from "date-fns";

export const maxDuration = 60;

// Accept an inspection (manager): the PDF is generated and, when a tenant is
// linked, vaulted to their documents. A manager's own walkthrough is handed
// in and accepted in one go ("Submit & accept"), passing the same checks.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  let report = loaded.report;

  if (report.status === "ACCEPTED" || report.tenantDocumentId) {
    return Response.json({ error: "Already accepted", tenantDocumentId: report.tenantDocumentId }, { status: 409 });
  }
  if (report.editRequestedAt) {
    return Response.json({ error: "Approve or decline the requested correction first." }, { status: 409 });
  }
  if (canEditObservations(report.status)) {
    const problems = submitProblems(submitInputFor(report, await loadUnitMeters(report.unitId)));
    if (problems.length) return Response.json({ error: problems[0], problems, code: "NOT_READY" }, { status: 400 });
    report = await markSubmitted(report, session!);
  }

  const pdf = await buildConditionReportPdf(report.id);
  if (!pdf) return Response.json({ error: "Inspection not found" }, { status: 404 });

  let tenantDocumentId: string | null = null;
  if (report.tenantId) {
    const dateStr = format(report.reportDate, "yyyy-MM-dd");
    const fileName = `condition-report-${report.reportType.toLowerCase()}-${dateStr}.pdf`;
    const storagePath = `tenants/${report.tenantId}/${Date.now()}-${fileName}`;
    try {
      await uploadToStorage(storagePath, pdf.buffer, "application/pdf");
    } catch {
      return Response.json({ error: "Document storage is unavailable — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
    }
    const labelType =
      report.reportType === "MOVE_IN" ? "Move-In Condition Report"
      : report.reportType === "MOVE_OUT" ? "Move-Out Condition Report"
      : "Mid-Term Condition Report";
    const doc = await prisma.tenantDocument.create({
      data: {
        tenantId: report.tenantId,
        category: "CONDITION_REPORT",
        label: `${labelType} — ${format(report.reportDate, "d MMM yyyy")}`,
        fileName,
        storagePath,
        fileSize: pdf.buffer.length,
        mimeType: "application/pdf",
      },
    });
    tenantDocumentId = doc.id;
  }

  const accepted = await prisma.conditionReport.update({
    where: { id: report.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedByUserId: session!.user.id,
      signedByManager: true,
      pdfGeneratedAt: new Date(),
      ...(tenantDocumentId ? { tenantDocumentId } : {}),
    },
    include: INSPECTION_INCLUDE,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: report.organizationId,
    before: { status: loaded.report.status },
    after: { status: "ACCEPTED", tenantDocumentId, photos: report.photos.length },
  });

  return Response.json({ ok: true, vaulted: !!tenantDocumentId, tenantDocumentId, inspection: await serializeInspection(accepted, session!) });
}
