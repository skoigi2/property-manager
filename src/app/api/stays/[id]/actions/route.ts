import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { stayActionSchema } from "@/lib/validations";
import { isInspectionManager } from "@/lib/inspections";
import { idStateOf, loadStay, serializeStay, stayUpdateFor } from "@/lib/stays";
import { decideStayAction, EMPTY_STAY } from "@/lib/stay-rules";

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
  const idState = idStateOf(entry);
  const decision = decideStayAction(
    action, record, idState, { isManager: isInspectionManager(session!) }, input,
    { checkOut: entry.checkOut!, today: new Date().toISOString().slice(0, 10) },
  );
  if (!decision.ok) {
    return Response.json({ error: decision.error, ...(decision.code ? { code: decision.code } : {}) }, { status: decision.status });
  }

  const actorName = session!.user.name ?? session!.user.email ?? "Someone";
  const data = stayUpdateFor(action, decision, actorName);
  try {
    await prisma.guestStay.upsert({
      where: { incomeEntryId: entry.id },
      create: { incomeEntryId: entry.id },
      update: {},
    });
  } catch (e) {
    // Two first actions at once: the other one created the row.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  // Apply only if nobody changed the steps this decision was based on (two
  // phones, or a manager's undo landing with a caretaker's tick).
  const applied = await prisma.guestStay.updateMany({
    where: {
      incomeEntryId: entry.id,
      keysHandedAt: record.keysHandedAt ? new Date(record.keysHandedAt) : null,
      keysReturnedAt: record.keysReturnedAt ? new Date(record.keysReturnedAt) : null,
      cleanerKeysOutAt: record.cleanerKeysOutAt ? new Date(record.cleanerKeysOutAt) : null,
      cleanerKeysBackAt: record.cleanerKeysBackAt ? new Date(record.cleanerKeysBackAt) : null,
      idOverrideReason: record.idOverrideReason ?? null,
    },
    data: data as Prisma.GuestStayUpdateManyMutationInput,
  });
  if (applied.count === 0) {
    return Response.json({ error: "Someone else just updated this stay — refresh and try again.", code: "CONFLICT" }, { status: 409 });
  }

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
