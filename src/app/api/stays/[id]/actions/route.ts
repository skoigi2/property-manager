import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { stayActionSchema } from "@/lib/validations";
import { isInspectionManager } from "@/lib/inspections";
import { loadStay, serializeStay, stayUpdateFor } from "@/lib/stays";
import { decideStayAction, stayIdState, EMPTY_STAY } from "@/lib/stay-rules";

// Keys to the guest and back, keys to the cleaner and back (ops staff incl.
// CARETAKER); ID override and undo (managers). Rules: src/lib/stay-rules.ts.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadStay(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const entry = loaded.entry;

  const parsed = stayActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { action, ...input } = parsed.data;

  const record = entry.guestStay ?? EMPTY_STAY;
  const idState = stayIdState(
    entry.bookingGuests.map((bg) => ({ isPrimary: bg.isPrimary, documentCount: bg.guest.documents.length })),
    record.idOverrideReason,
  );
  const decision = decideStayAction(action, record, idState, { isManager: isInspectionManager(session!) }, input);
  if (!decision.ok) {
    return Response.json({ error: decision.error, ...(decision.code ? { code: decision.code } : {}) }, { status: decision.status });
  }

  const actorName = session!.user.name ?? session!.user.email ?? "Someone";
  const data = stayUpdateFor(action, decision, actorName);
  await prisma.guestStay.upsert({
    where: { incomeEntryId: entry.id },
    create: { incomeEntryId: entry.id },
    update: {},
  });
  await prisma.guestStay.update({ where: { incomeEntryId: entry.id }, data });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "GuestStay",
    resourceId: entry.id,
    organizationId: entry.unit.property.organizationId,
    after: { action, ...(decision.keys ? { keys: decision.keys } : {}), ...(decision.cleanerName ? { cleanerName: decision.cleanerName } : {}), ...(decision.reason ? { reason: decision.reason } : {}), ...(decision.step ? { step: decision.step } : {}) },
  });

  const reloaded = await loadStay(entry.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json(await serializeStay(reloaded.entry, session!));
}
