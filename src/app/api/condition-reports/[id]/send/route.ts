import "server-only";
import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendNotificationEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { buildConditionReportPdf } from "@/lib/condition-report-pdf-data";
import { inspectionReportToTenantTemplate } from "@/lib/notifications/email-templates";
import { loadInspection, serializeInspection, INSPECTION_INCLUDE } from "@/lib/inspections";
import { INSPECTION_TYPE_LABEL } from "@/lib/inspection-rules";

export const maxDuration = 60;

const bodySchema = z.object({ message: z.string().max(2000).nullable().optional() });

// A manager emails the accepted report, photos included, to the tenant.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;
  if (report.status !== "ACCEPTED") return Response.json({ error: "Accept the report before sending it to the tenant." }, { status: 409 });
  if (!report.tenant) return Response.json({ error: "No tenant is linked to this inspection." }, { status: 400 });
  if (!report.tenant.email) return Response.json({ error: `${report.tenant.name} has no email address on file.` }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const message = parsed.success ? parsed.data.message?.trim() || null : null;

  const pdf = await buildConditionReportPdf(report.id);
  if (!pdf) return Response.json({ error: "Inspection not found" }, { status: 404 });
  const org = report.organizationId
    ? await prisma.organization.findUnique({ where: { id: report.organizationId }, select: { name: true } })
    : null;

  const typeLabel = INSPECTION_TYPE_LABEL[report.reportType];
  const { subject, html } = inspectionReportToTenantTemplate({
    tenantName: report.tenant.name,
    typeLabel,
    propertyName: report.property.name,
    unitRef: report.unit.unitNumber,
    orgName: org?.name ?? report.property.name,
    message,
  });
  try {
    await sendNotificationEmail(report.tenant.email, subject, html, {
      organizationId: report.organizationId ?? undefined,
      attachments: [{ filename: pdf.fileName, content: pdf.buffer }],
    });
  } catch {
    return Response.json({ error: "The email could not be sent — try again shortly." }, { status: 502 });
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.conditionReport.update({ where: { id: report.id }, data: { sentToTenantAt: now }, include: INSPECTION_INCLUDE }),
    prisma.communicationLog.create({
      data: {
        tenantId: report.tenant.id,
        type: "EMAIL",
        subject,
        body: message ?? `${typeLabel} condition report sent with photos.`,
        templateUsed: "CONDITION_REPORT",
        loggedByEmail: session!.user.email ?? "system",
        loggedByName: session!.user.name ?? null,
        sentAt: now,
      },
    }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: report.organizationId,
    after: { sentToTenantAt: now, to: report.tenant.email },
  });

  return Response.json(await serializeInspection(updated, session!));
}
