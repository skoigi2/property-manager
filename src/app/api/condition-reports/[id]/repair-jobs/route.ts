import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { format } from "date-fns";
import { logAudit } from "@/lib/audit";
import { loadInspection, serializeInspection, INSPECTION_INCLUDE } from "@/lib/inspections";
import { INSPECTION_TYPE_LABEL, type InspectionItem } from "@/lib/inspection-rules";
import { createMaintenanceJob } from "@/lib/maintenance-create";
import { repairCategoryFor } from "@/lib/turnover";

const bodySchema = z.object({ itemIds: z.array(z.string()).min(1, "Pick at least one item").max(60) });

// Raise a maintenance job for each picked item in fair or poor condition on a
// handed-in inspection (manager). One job per item, never twice: the item
// remembers its jobId. The jobs carry conditionReportId, which is what the
// unit's "ready to re-let" checklist follows for "Repairs done".
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;
  if (report.status !== "SUBMITTED" && report.status !== "ACCEPTED") {
    return Response.json({ error: "Hand the inspection in first." }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const items = ((report.items as unknown as (InspectionItem & { jobId?: string })[]) ?? []).map((i) => ({ ...i }));
  const picked = items.filter((i) => parsed.data.itemIds.includes(i.id) && (i.status === "POOR" || i.status === "FAIR") && !i.jobId);
  if (picked.length === 0) return Response.json({ error: "Those items already have jobs, or aren't damaged." }, { status: 400 });

  const actor = { id: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null };
  const when = format(report.submittedAt ?? report.reportDate, "d MMM yyyy");
  const created: { itemId: string; jobId: string }[] = [];
  for (const it of picked) {
    const job = await createMaintenanceJob(
      {
        propertyId: report.propertyId,
        unitId: report.unitId,
        title: `${it.room} — ${it.feature}`,
        description: [
          `Recorded as ${it.status} on the ${INSPECTION_TYPE_LABEL[report.reportType].toLowerCase()} inspection of Unit ${report.unit.unitNumber} (${when}).`,
          it.notes?.trim() ? `Inspector's note: ${it.notes.trim()}` : null,
        ].filter(Boolean).join("\n"),
        category: repairCategoryFor(it.feature, it.room),
        priority: it.status === "POOR" ? "HIGH" : "MEDIUM",
        reportedBy: report.submittedByName ?? undefined,
        reportedDate: new Date(),
        conditionReportId: report.id,
      },
      actor,
    );
    it.jobId = job.id;
    created.push({ itemId: it.id, jobId: job.id });
  }

  const updated = await prisma.conditionReport.update({
    where: { id: report.id },
    data: { items: items as unknown as Prisma.InputJsonValue },
    include: INSPECTION_INCLUDE,
  });
  // An open re-let checklist for the unit now follows these jobs.
  await prisma.unitTurnover.updateMany({
    where: { unitId: report.unitId, completedAt: null, conditionReportId: null },
    data: { conditionReportId: report.id },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "MaintenanceJob",
    resourceId: report.id,
    organizationId: report.organizationId,
    after: { fromInspection: report.id, jobs: created },
  });

  return Response.json(await serializeInspection(updated, session!), { status: 201 });
}
