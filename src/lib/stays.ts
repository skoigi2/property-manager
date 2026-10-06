import "server-only";
import { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/auth-utils";
import { getSignedUrl } from "@/lib/supabase-storage";
import { isInspectionManager, fail, type ServiceError } from "@/lib/inspections";
import { damagedItems, normaliseKeys, type InspectionItem } from "@/lib/inspection-rules";
import { stayIdState, EMPTY_STAY, type StayDecision, type StayAction } from "@/lib/stay-rules";

// Short-stay guests on site: the booking (an AIRBNB IncomeEntry) seen without
// money, plus its GuestStay record. Pure rules: src/lib/stay-rules.ts.
// Nothing here ever returns grossAmount, nightlyRate, commission, agent or
// note — caretakers read this.

const DOC_SELECT = { id: true, label: true, fileName: true, storagePath: true, mimeType: true, uploadedAt: true, uploadedByUserId: true } as const;

export const STAY_INCLUDE = {
  unit: { select: { id: true, unitNumber: true, propertyId: true, property: { select: { id: true, name: true, organizationId: true } } } },
  guestStay: true,
  bookingGuests: {
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    select: {
      isPrimary: true,
      guest: {
        select: {
          id: true, name: true, phone: true, nationality: true, passportNumber: true,
          documents: { orderBy: { uploadedAt: "asc" as const }, select: DOC_SELECT },
        },
      },
    },
  },
  conditionReports: {
    where: { reportType: "POST_STAY" as const },
    orderBy: { createdAt: "desc" as const },
    select: { id: true, status: true, items: true, submittedAt: true, acceptedAt: true, createdAt: true },
  },
} satisfies Prisma.IncomeEntryInclude;

const findStay = (id: string) => prisma.incomeEntry.findUnique({ where: { id }, include: STAY_INCLUDE });
// From the extended client (money fields are numbers there), not Prisma's payload type.
export type StayEntry = NonNullable<Awaited<ReturnType<typeof findStay>>>;

const isStayBooking = (e: { type: string; checkIn: Date | null; checkOut: Date | null }) =>
  e.type === "AIRBNB" && !!e.checkIn && !!e.checkOut;

/** A booking the session may see (404 for anything else, incl. non-AIRBNB income). */
export async function loadStay(entryId: string): Promise<{ ok: true; entry: StayEntry } | ServiceError> {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return fail(401, "Unauthorized");
  const entry = await findStay(entryId);
  if (!entry || !isStayBooking(entry) || !propertyIds.includes(entry.unit.propertyId)) return fail(404, "Stay not found");
  return { ok: true, entry };
}

function idStateOf(entry: Pick<StayEntry, "bookingGuests" | "guestStay">) {
  return stayIdState(
    entry.bookingGuests.map((bg) => ({ isPrimary: bg.isPrimary, documentCount: bg.guest.documents.length })),
    entry.guestStay?.idOverrideReason ?? null,
  );
}

function stayRecord(entry: Pick<StayEntry, "guestStay">) {
  const s = entry.guestStay;
  if (!s) return { ...EMPTY_STAY, idOverrideAt: null, idOverrideByName: null, keysHanded: [], keysHandedByName: null, keysReturnedByName: null, cleanerName: null, cleanerKeysOutByName: null, cleanerKeysBackByName: null };
  return {
    idOverrideReason: s.idOverrideReason, idOverrideAt: s.idOverrideAt, idOverrideByName: s.idOverrideByName,
    keysHanded: normaliseKeys(s.keysHanded), keysHandedAt: s.keysHandedAt, keysHandedByName: s.keysHandedByName,
    keysReturnedAt: s.keysReturnedAt, keysReturnedByName: s.keysReturnedByName,
    cleanerName: s.cleanerName, cleanerKeysOutAt: s.cleanerKeysOutAt, cleanerKeysOutByName: s.cleanerKeysOutByName,
    cleanerKeysBackAt: s.cleanerKeysBackAt, cleanerKeysBackByName: s.cleanerKeysBackByName,
  };
}

function inspectionsOf(entry: Pick<StayEntry, "conditionReports">) {
  return entry.conditionReports.map((r) => ({
    id: r.id, status: r.status, submittedAt: r.submittedAt, acceptedAt: r.acceptedAt,
    damaged: damagedItems((r.items as unknown as InspectionItem[]) ?? []).length,
  }));
}

function bookingCore(entry: StayEntry) {
  const nights = Math.max(0, Math.round((entry.checkOut!.getTime() - entry.checkIn!.getTime()) / 86_400_000));
  return {
    id: entry.id,
    checkIn: entry.checkIn!,
    checkOut: entry.checkOut!,
    nights,
    platform: entry.platform,
    unit: { id: entry.unit.id, unitNumber: entry.unit.unitNumber },
    property: { id: entry.unit.property.id, name: entry.unit.property.name },
  };
}

/** One stay for a list row — no documents, no money. */
export function serializeStaySummary(entry: StayEntry) {
  const main = entry.bookingGuests[0]?.guest ?? null;
  return {
    ...bookingCore(entry),
    guestCount: entry.bookingGuests.length,
    mainGuestName: main?.name ?? null,
    idState: idStateOf(entry),
    stay: stayRecord(entry),
    inspection: inspectionsOf(entry)[0] ?? null,
  };
}

async function signedOrNull(path: string): Promise<string | null> {
  try { return await getSignedUrl(path); } catch { return null; }
}

/** The stay page: guests with their ID documents (signed), keys, cleaner, post-stay checks. */
export async function serializeStay(entry: StayEntry, session: Session) {
  const manager = isInspectionManager(session);
  const guests = await Promise.all(entry.bookingGuests.map(async (bg) => ({
    id: bg.guest.id,
    name: bg.guest.name,
    phone: bg.guest.phone,
    nationality: bg.guest.nationality,
    idNumber: bg.guest.passportNumber,
    isPrimary: bg.isPrimary,
    documents: await Promise.all(bg.guest.documents.map(async (d) => ({
      id: d.id, label: d.label, fileName: d.fileName, mimeType: d.mimeType, uploadedAt: d.uploadedAt,
      url: await signedOrNull(d.storagePath),
      canDelete: manager || (!!d.uploadedByUserId && d.uploadedByUserId === session.user.id),
    }))),
  })));
  return {
    ...bookingCore(entry),
    guests,
    idState: idStateOf(entry),
    stay: stayRecord(entry),
    inspections: inspectionsOf(entry),
    viewer: { isManager: manager, userId: session.user.id },
  };
}

/** Bookings overlapping [from, to] (yyyy-mm-dd, inclusive) on the session's properties. */
export async function listStays(f: { from: string; to: string; propertyId?: string | null }) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return [];
  const scope = f.propertyId ? propertyIds.filter((id) => id === f.propertyId) : propertyIds;
  const from = new Date(`${f.from}T00:00:00.000Z`);
  const toExclusive = new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000);
  const rows = await prisma.incomeEntry.findMany({
    where: {
      type: "AIRBNB",
      checkIn: { not: null, lt: toExclusive },
      checkOut: { not: null, gte: from },
      unit: { propertyId: { in: scope } },
    },
    orderBy: [{ checkIn: "asc" }],
    take: 500,
    include: STAY_INCLUDE,
  });
  return rows.map(serializeStaySummary);
}

/** The data change for a decided action (stay-rules.decideStayAction). */
export function stayUpdateFor(action: StayAction, d: Extract<StayDecision, { ok: true }>, actorName: string): Prisma.GuestStayUpdateInput {
  const now = new Date();
  switch (action) {
    case "hand_keys":
      return { keysHanded: d.keys as unknown as Prisma.InputJsonValue, keysHandedAt: now, keysHandedByName: actorName };
    case "return_keys":
      return { keysReturnedAt: now, keysReturnedByName: actorName };
    case "cleaner_out":
      return { cleanerName: d.cleanerName, cleanerKeysOutAt: now, cleanerKeysOutByName: actorName };
    case "cleaner_back":
      return { cleanerKeysBackAt: now, cleanerKeysBackByName: actorName };
    case "override_id":
      return { idOverrideReason: d.reason, idOverrideAt: now, idOverrideByName: actorName };
    case "undo":
      switch (d.step) {
        case "keys_out": return { keysHanded: Prisma.DbNull, keysHandedAt: null, keysHandedByName: null };
        case "keys_back": return { keysReturnedAt: null, keysReturnedByName: null };
        case "cleaner_out": return { cleanerName: null, cleanerKeysOutAt: null, cleanerKeysOutByName: null };
        case "cleaner_back": return { cleanerKeysBackAt: null, cleanerKeysBackByName: null };
      }
  }
  return {};
}
