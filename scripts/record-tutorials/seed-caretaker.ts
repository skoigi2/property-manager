/**
 * Recording preconditions for the caretaker tutorials (`caretaker-inspections`,
 * `guest-stays`) and their guide screenshots.
 *
 * Same Kenyan org as `utilities-metering` (seedUtilities re-creates its
 * Kilimani Court demo), plus:
 * - a caretaker account, guide-caretaker@groundworkpm.com ("Joseph Mwangi",
 *   same dev password), with access to the org's properties;
 * - inspections: Peter Omondi (302) moving out — an accepted move-in report to
 *   compare against, and a move-out inspection booked for today and assigned to
 *   the caretaker with every room done except the Bathroom (the video does it);
 * - guest stays: a short-stay block, "Westlands Suites" (AIRBNB), with a guest
 *   arriving today (A1), one leaving today with the keys (A2, whose previous
 *   stay's post-stay check gives the rooms and the "Last stay" comparison), one
 *   in house (A3) and one upcoming (B1).
 * Photos and the sample ID are fixtures served by fake-storage.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { seedUtilities, UTILITIES_RECORD_EMAIL, RECORD_PASSWORD } from "./seed-utilities";
import { fixturePath } from "./fake-storage";
import { seedItemsFromTemplate } from "../../src/lib/condition-report-template";

export const CARETAKER_EMAIL = process.env.RECORD_CARETAKER_EMAIL ?? "guide-caretaker@groundworkpm.com";
export const CARETAKER_NAME = "Joseph Mwangi";
export const MOVE_OUT_TENANT = "Peter Omondi";
export const STAYS_PROPERTY = "Westlands Suites";
export const ARRIVING_GUEST = "Amina Wanjiru";
export const LEAVING_GUEST = "Daniel Mutua";

const ROOM_PHOTO: Record<string, string> = {
  "Living Room": "living-room.jpg",
  Kitchen: "kitchen.jpg",
  "Master Bedroom": "bedroom.jpg",
  "Second Bedroom": "bedroom.jpg",
  Bedroom: "bedroom.jpg",
  Bathroom: "bathroom.jpg",
  "Hallway / Entrance": "living-room.jpg",
  "Balcony / Outdoors": "living-room.jpg",
};

const utcDay = (offsetDays: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays));
};

/** A local afternoon (14:00) — handover times, unlike booking dates, carry a time of day. */
const at2pm = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(14, 0, 0, 0);
  return d;
};

async function orgAndAdmin(prisma: PrismaClient) {
  const admin = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL }, select: { id: true, name: true, organizationId: true } });
  if (!admin?.organizationId) throw new Error("Utilities recording org missing — seedUtilities should have created it");
  return { orgId: admin.organizationId, admin };
}

/** The caretaker account, a member of the org with access to the given properties. */
async function ensureCaretaker(prisma: PrismaClient, orgId: string, propertyIds: string[]) {
  const password = await bcrypt.hash(RECORD_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: CARETAKER_EMAIL },
    create: { email: CARETAKER_EMAIL, name: CARETAKER_NAME, password, role: "CARETAKER", organizationId: orgId, isActive: true },
    update: { name: CARETAKER_NAME, password, role: "CARETAKER", organizationId: orgId, isActive: true },
  });
  await prisma.userOrganizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    create: { userId: user.id, organizationId: orgId, role: "CARETAKER" },
    update: { role: "CARETAKER" },
  });
  for (const propertyId of propertyIds) {
    await prisma.propertyAccess.upsert({
      where: { userId_propertyId: { userId: user.id, propertyId } },
      create: { userId: user.id, propertyId },
      update: {},
    });
  }
  return user;
}

/** Items with ratings and fixture photos; rooms in `leaveOpen` stay unrated with no photos. */
async function filledItems(
  prisma: PrismaClient,
  reportId: string,
  items: { id: string; room: string; feature: string; status: string | null; notes?: string; photoIds: string[] }[],
  opts: { leaveOpen?: string[]; perRoom?: number; notes?: Record<string, { status: string; notes: string; photo?: string }> },
) {
  const perRoom = opts.perRoom ?? 3;
  const rooms = Array.from(new Set(items.map((i) => i.room)));
  for (const room of rooms) {
    if (opts.leaveOpen?.includes(room)) continue;
    const roomItems = items.filter((i) => i.room === room);
    for (const it of roomItems) {
      const special = opts.notes?.[`${room}/${it.feature}`];
      it.status = special?.status ?? "GOOD";
      it.notes = special?.notes ?? "";
      if (special?.photo) {
        const ph = await prisma.conditionReportPhoto.create({ data: { reportId, storagePath: fixturePath(special.photo), fileName: special.photo, mimeType: "image/jpeg", fileSize: 60_000 } });
        it.photoIds = [...it.photoIds, ph.id];
      }
    }
    for (let n = 0; n < perRoom; n++) {
      const file = ROOM_PHOTO[room] ?? "living-room.jpg";
      const ph = await prisma.conditionReportPhoto.create({ data: { reportId, storagePath: fixturePath(file), fileName: file, mimeType: "image/jpeg", fileSize: 60_000 } });
      const target = roomItems[n % roomItems.length];
      target.photoIds = [...target.photoIds, ph.id];
    }
  }
  return items;
}

export async function seedCaretakerInspections(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  await seedUtilities(prisma, fixturesDir);
  const { orgId, admin } = await orgAndAdmin(prisma);
  const kilimani = await prisma.property.findFirst({ where: { organizationId: orgId, name: "Kilimani Court" }, select: { id: true } });
  if (!kilimani) throw new Error("Kilimani Court not found after seeding");
  const caretaker = await ensureCaretaker(prisma, orgId, [kilimani.id]);

  const tenant = await prisma.tenant.findFirst({
    where: { name: MOVE_OUT_TENANT, isActive: true, unit: { propertyId: kilimani.id } },
    select: { id: true, unitId: true, leaseStart: true },
  });
  if (!tenant) throw new Error(`No active tenant "${MOVE_OUT_TENANT}" in Kilimani Court`);
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { emergencyContactName: "Rose Omondi", emergencyContactPhone: "+254 733 200 410", emergencyContactRelation: "Sister" },
  });

  // The accepted move-in report the move-out compares against.
  const moveIn = await prisma.conditionReport.create({
    data: {
      unitId: tenant.unitId, propertyId: kilimani.id, organizationId: orgId, tenantId: tenant.id,
      reportType: "MOVE_IN", status: "ACCEPTED", reportDate: tenant.leaseStart, acceptedAt: tenant.leaseStart,
      submittedAt: tenant.leaseStart, submittedByName: CARETAKER_NAME, tenantSignOff: "ABSENT",
      items: [] as unknown as Prisma.InputJsonValue,
    },
  });
  const moveInItems = await filledItems(prisma, moveIn.id, seedItemsFromTemplate().map((i) => ({ ...i })), { perRoom: 1 });
  await prisma.conditionReport.update({ where: { id: moveIn.id }, data: { items: moveInItems as unknown as Prisma.InputJsonValue } });

  // Today's move-out: every room done except the Bathroom.
  // About an hour from now, on the quarter hour — never shown as overdue on camera.
  const at = new Date(Date.now() + 60 * 60_000); at.setMinutes(Math.ceil(at.getMinutes() / 15) * 15, 0, 0);
  const moveOut = await prisma.conditionReport.create({
    data: {
      unitId: tenant.unitId, propertyId: kilimani.id, organizationId: orgId, tenantId: tenant.id,
      reportType: "MOVE_OUT", status: "IN_PROGRESS", reportDate: at, scheduledFor: at,
      assignedToUserId: caretaker.id, createdByUserId: admin.id,
      items: [] as unknown as Prisma.InputJsonValue,
    },
  });
  const moveOutItems = await filledItems(prisma, moveOut.id, seedItemsFromTemplate().map((i) => ({ ...i })), {
    leaveOpen: ["Bathroom"],
    notes: { "Living Room/Walls": { status: "FAIR", notes: "Scuff marks behind the sofa", photo: "wall-damage.jpg" } },
  });
  await prisma.conditionReport.update({ where: { id: moveOut.id }, data: { items: moveOutItems as unknown as Prisma.InputJsonValue } });
  console.log(`  ✓ caretaker ${CARETAKER_EMAIL}; move-out inspection for ${MOVE_OUT_TENANT} (Bathroom left to do)`);
}

export async function seedGuestStays(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  await seedUtilities(prisma, fixturesDir);
  const { orgId } = await orgAndAdmin(prisma);
  const kilimani = await prisma.property.findFirst({ where: { organizationId: orgId, name: "Kilimani Court" }, select: { id: true } });
  // Guests are org-scoped and outlive the deleted property — clear them, or the
  // on-camera guest is matched as a returning one (ID already on file).
  await prisma.airbnbGuest.deleteMany({ where: { organizationId: orgId } });

  const property = await prisma.property.create({
    data: { name: STAYS_PROPERTY, type: "AIRBNB", currency: "KES", city: "Nairobi", address: "Waiyaki Way, Westlands", organizationId: orgId },
  });
  const admins = await prisma.userOrganizationMembership.findMany({ where: { organizationId: orgId }, select: { userId: true } });
  await prisma.propertyAccess.createMany({ data: admins.map((m) => ({ userId: m.userId, propertyId: property.id })), skipDuplicates: true });
  const caretaker = await ensureCaretaker(prisma, orgId, [property.id, ...(kilimani ? [kilimani.id] : [])]);

  const units: Record<string, string> = {};
  for (const [unitNumber, type] of [["A1", "ONE_BED"], ["A2", "ONE_BED"], ["A3", "BEDSITTER"], ["B1", "TWO_BED"]] as const) {
    const u = await prisma.unit.create({ data: { propertyId: property.id, unitNumber, type, status: "ACTIVE" } as Prisma.UnitUncheckedCreateInput });
    units[unitNumber] = u.id;
  }

  const booking = async (unit: string, inDays: number, nights: number, platform: "AIRBNB" | "BOOKING_COM" | "DIRECT", rate: number) =>
    prisma.incomeEntry.create({
      data: {
        unitId: units[unit], type: "AIRBNB", date: utcDay(inDays), checkIn: utcDay(inDays), checkOut: utcDay(inDays + nights),
        grossAmount: rate * nights, nightlyRate: rate, platform,
      },
    });
  const guest = async (entryId: string, name: string, phone: string, idNumber: string, withId: boolean) => {
    const g = await prisma.airbnbGuest.create({ data: { name, phone, passportNumber: idNumber, nationality: "Kenyan", organizationId: orgId } });
    await prisma.bookingGuest.create({ data: { guestId: g.id, incomeEntryId: entryId, isPrimary: true } });
    if (withId) {
      await prisma.guestDocument.create({
        data: { guestId: g.id, label: "ID document", fileName: "id-card.jpg", storagePath: fixturePath("id-card.jpg"), mimeType: "image/jpeg", fileSize: 60_000, uploadedByUserId: caretaker.id },
      });
    }
    return g;
  };
  const keysOut = (entryId: string, daysAgo: number, back: boolean) =>
    prisma.guestStay.create({
      data: {
        incomeEntryId: entryId,
        keysHanded: [{ label: "Main door", count: 1 }, { label: "Gate", count: 1 }] as unknown as Prisma.InputJsonValue,
        keysHandedAt: at2pm(-daysAgo), keysHandedByName: CARETAKER_NAME,
        ...(back ? { keysReturnedAt: at2pm(-daysAgo + 3), keysReturnedByName: CARETAKER_NAME, cleanerName: "Mary Achieng", cleanerKeysOutAt: at2pm(-daysAgo + 3), cleanerKeysOutByName: CARETAKER_NAME, cleanerKeysBackAt: at2pm(-daysAgo + 3), cleanerKeysBackByName: CARETAKER_NAME } : {}),
      },
    });

  // A2's previous stay, fully turned over, with its post-stay check (rooms + "Last stay" baseline).
  const prior = await booking("A2", -10, 3, "AIRBNB", 7500);
  await keysOut(prior.id, 10, true);
  const priorCheck = await prisma.conditionReport.create({
    data: {
      unitId: units.A2, propertyId: property.id, organizationId: orgId, reportType: "POST_STAY", incomeEntryId: prior.id,
      status: "ACCEPTED", reportDate: utcDay(-7), submittedAt: utcDay(-7), acceptedAt: utcDay(-7), submittedByName: CARETAKER_NAME,
      items: [] as unknown as Prisma.InputJsonValue,
    },
  });
  const priorItems = await filledItems(prisma, priorCheck.id,
    ["Living Room", "Kitchen", "Bedroom", "Bathroom"].map((room) => ({ id: randomUUID(), room, feature: "Overall", status: null, notes: "", photoIds: [] as string[] })),
    { perRoom: 1 });
  await prisma.conditionReport.update({ where: { id: priorCheck.id }, data: { items: priorItems as unknown as Prisma.InputJsonValue } });

  // Today's picture.
  await booking("A1", 0, 3, "AIRBNB", 7500);                       // arriving — guest added on camera
  const leaving = await booking("A2", -3, 3, "BOOKING_COM", 8000); // leaving today, has the keys
  await guest(leaving.id, LEAVING_GUEST, "+254 711 300 220", "29384756", true);
  await keysOut(leaving.id, 3, false);
  const inHouse = await booking("A3", -1, 3, "DIRECT", 6000);      // in house
  await guest(inHouse.id, "Sarah Kimani", "+254 712 300 330", "31827364", true);
  await keysOut(inHouse.id, 1, false);
  await booking("B1", 3, 4, "AIRBNB", 11000);                      // upcoming
  await booking("B1", -8, 5, "BOOKING_COM", 10500);                // calendar history
  await booking("A3", -9, 4, "AIRBNB", 6000);
  console.log(`  ✓ ${STAYS_PROPERTY}: arriving (A1), leaving today (A2), in house (A3), upcoming (B1); caretaker ${CARETAKER_EMAIL}`);
}
