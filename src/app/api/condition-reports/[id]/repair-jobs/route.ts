import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { format } from "date-fns";
import { logAudit } from "@/lib/audit";
import { loadInspection, serializeInspection, INSPECTION_INCLUDE } from "@/lib/inspections";
import { INSPECTION_TYPE_LABEL, REPAIR_CLAIM, hasRepairJob, type InspectionItem } from "@/lib/inspection-rules";
import { createMaintenanceJob } from "@/lib/maintenance-create";
import { repairCategoryFor } from "@/lib/turnover";

const PENDING = REPAIR_CLAIM;
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

  // Every write goes onto the latest items and only if nobody wrote in between
  // (another manager raising other items, a correction) — retried a few times.
  type Item = InspectionItem;
  const writeItems = async (change: (items: Item[]) => Item[] | null): Promise<"ok" | "none" | "conflict"> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await prisma.conditionReport.findUnique({ where: { id: report.id }, select: { items: true, updatedAt: true } });
      if (!cur) return "none";
      const next = change(((cur.items as unknown as Item[]) ?? []).map((i) => ({ ...i })));
      if (!next) return "none";
      const res = await prisma.conditionReport.updateMany({
        where: { id: report.id, updatedAt: cur.updatedAt },
        data: { items: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) return "ok";
    }
    return "conflict";
  };

  // Claim the picked items first, so a double click or a second manager can't
  // raise the same jobs twice.
  let picked: Item[] = [];
  const claim = await writeItems((items) => {
    picked = items.filter((i) => parsed.data.itemIds.includes(i.id) && (i.status === "POOR" || i.status === "FAIR") && !hasRepairJob(i));
    if (picked.length === 0) return null;
    const ids = new Set(picked.map((i) => i.id));
    const pendingAt = new Date().toISOString();
    return items.map((i) => (ids.has(i.id) ? { ...i, jobId: PENDING, pendingAt } : i));
  });
  if (claim === "none") return Response.json({ error: "Those items already have jobs, or aren't damaged." }, { status: 400 });
  if (claim === "conflict") return Response.json({ error: "This inspection is being changed — refresh and try again.", code: "CONFLICT" }, { status: 409 });

  const actor = { id: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null };
  const when = format(report.submittedAt ?? report.reportDate, "d MMM yyyy");
  const created: { itemId: string; jobId: string }[] = [];
  // Put the new job ids on our claimed items; items whose job wasn't made go back to "no job".
  const settle = () => {
    const jobFor = new Map(created.map((c) => [c.itemId, c.jobId]));
    const mine = new Set(picked.map((i) => i.id));
    return writeItems((items) => items.map((i) => {
      if (!mine.has(i.id) || i.jobId !== PENDING) return i;
      const { jobId: _pending, pendingAt: _at, ...rest } = i;
      const jobId = jobFor.get(i.id);
      return jobId ? { ...rest, jobId } : rest;
    }));
  };
  try {
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
      created.push({ itemId: it.id, jobId: job.id });
    }
  } catch (e) {
    await settle().catch((err) => console.error("[repair-jobs] could not release claimed items:", err));
    throw e;
  }
  if ((await settle()) !== "ok") console.error(`[repair-jobs] could not record job ids on report ${report.id}`, created);
  const updated = await prisma.conditionReport.findUniqueOrThrow({ where: { id: report.id }, include: INSPECTION_INCLUDE });
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
