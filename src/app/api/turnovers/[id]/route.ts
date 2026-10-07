import { requireOpsStaffWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { loadTurnover } from "@/lib/turnover-data";
import { decideTurnoverToggle, normaliseTurnoverItems, setTurnoverItem, effectiveTurnoverItems, turnoverProgress, TURNOVER_ITEMS } from "@/lib/turnover";
import { isInspectionManager } from "@/lib/inspections";

const KEYS = TURNOVER_ITEMS.map((t) => t.key) as [string, ...string[]];
const toggleSchema = z.union([
  z.object({ key: z.enum(KEYS), done: z.boolean() }),
  // Every item is done (e.g. the last repair job just closed): close the checklist.
  z.object({ complete: z.literal(true) }),
]);

// Tick or untick a checklist item (ops staff incl. CARETAKER — they clean,
// walk through and hand over on site). The checklist completes itself when
// every item is done.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadTurnover(params.id);
  const propertyIds = await getAccessiblePropertyIds();
  if (!loaded || !propertyIds?.includes(loaded.row.propertyId)) return Response.json({ error: "Checklist not found" }, { status: 404 });

  const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown item" }, { status: 400 });
  const { view, row } = loaded;
  const byName = session!.user.name ?? session!.user.email ?? null;

  if ("complete" in parsed.data) {
    if (row.completedAt) return Response.json(view);
    if (!view.progress.complete) return Response.json({ error: "Some items are still open." }, { status: 409 });
    await prisma.unitTurnover.update({ where: { id: row.id }, data: { completedAt: new Date(), completedByName: byName } });
    await logAudit({
      userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "UnitTurnover",
      resourceId: row.id, organizationId: row.organizationId, after: { completed: true, unitId: row.unitId },
    });
    return Response.json((await loadTurnover(row.id))?.view);
  }
  const key = parsed.data.key as (typeof TURNOVER_ITEMS)[number]["key"];

  const decision = decideTurnoverToggle(key, parsed.data.done, {
    repairs: view.repairs, depositSettled: view.depositSettled, completed: !!row.completedAt, isManager: isInspectionManager(session!),
  });
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });

  // Two quick ticks must not undo each other: re-read the list and write only
  // if it hasn't changed since (updatedAt), retrying a few times.
  let progress = view.progress;
  let saved = false;
  for (let attempt = 0; attempt < 4 && !saved; attempt++) {
    const current = attempt === 0 ? row : await prisma.unitTurnover.findUnique({ where: { id: row.id } });
    if (!current) return Response.json({ error: "Checklist not found" }, { status: 404 });
    if (current.completedAt) return Response.json({ error: "This checklist is complete." }, { status: 409 });
    const items = setTurnoverItem(normaliseTurnoverItems(current.items), key, parsed.data.done, byName);
    progress = turnoverProgress(effectiveTurnoverItems(items, { repairs: view.repairs, depositSettled: view.depositSettled }));
    const res = await prisma.unitTurnover.updateMany({
      where: { id: row.id, updatedAt: current.updatedAt },
      data: {
        items: items as unknown as Prisma.InputJsonValue,
        ...(progress.complete ? { completedAt: new Date(), completedByName: byName } : {}),
      },
    });
    saved = res.count === 1;
  }
  if (!saved) return Response.json({ error: "Someone else is updating this checklist — refresh and try again." }, { status: 409 });
  if (progress.complete) {
    await logAudit({
      userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "UnitTurnover",
      resourceId: row.id, organizationId: row.organizationId, after: { completed: true, unitId: row.unitId },
    });
  }
  const after = await loadTurnover(row.id);
  return Response.json(after?.view);
}
