import { requireOpsStaff, requireOpsStaffWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { submitReadingSchema, UTILITY_TYPE_VALUES } from "@/lib/validations";
import { buildReadingSheet, canSeeUtilityMoney, submitReading } from "@/lib/utility-readings";
import { photoReadingMismatch } from "@/lib/utility-billing";
import { recordMeterPhotoCheck } from "@/lib/meter-photo-reader";
import {
  MeterPhotoStorageError,
  parseReadingRequest,
  storageUnavailableResponse,
  uploadMeterPhotos,
  validateMeterPhotos,
} from "@/lib/meter-photos";

export const maxDuration = 30;

/**
 * GET /api/utilities/readings?propertyId=&year=&month=&utility=
 * The month's reading sheet: every active meter with its previous reading and
 * this month's reading, if any. Ops staff incl. CARETAKER — the caretaker's
 * payload carries units only, never rates, amounts or invoice links.
 */
export async function GET(req: Request) {
  const { session, error } = await requireOpsStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const utility = searchParams.get("utility");
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }

  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const sheet = await buildReadingSheet({
    propertyId,
    year,
    month,
    utility: (UTILITY_TYPE_VALUES as readonly string[]).includes(utility ?? "")
      ? (utility as (typeof UTILITY_TYPE_VALUES)[number])
      : undefined,
    includeMoney: canSeeUtilityMoney(session!),
  });
  return Response.json(sheet);
}

/**
 * POST /api/utilities/readings — submit a month-end reading (JSON, or
 * multipart with up to 3 `photo` files). Ops staff incl. CARETAKER. The
 * previous reading is derived on the server; only a manager may override it.
 */
export async function POST(req: Request) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const { fields, files } = await parseReadingRequest(req);
  const parsed = submitReadingSchema.safeParse(fields);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json({ error: first?.message ?? "Invalid reading" }, { status: 400 });
  }
  const readingDate = new Date(parsed.data.readingDate);
  if (isNaN(readingDate.getTime())) return Response.json({ error: "Invalid reading date" }, { status: 400 });
  if (readingDate.getTime() > Date.now() + 86_400_000) {
    return Response.json({ error: "The reading date can't be in the future." }, { status: 400 });
  }

  const meter = await prisma.utilityMeter.findUnique({
    where: { id: parsed.data.meterId },
    select: { id: true, propertyId: true, utility: true, label: true, meterNumber: true, property: { select: { organizationId: true } } },
  });
  if (!meter) return Response.json({ error: "Meter not found" }, { status: 404 });
  const access = await requirePropertyAccess(meter.propertyId);
  if (!access.ok) return access.error!;

  const photoError = validateMeterPhotos(files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
  if (photoError) return Response.json({ error: photoError }, { status: 400 });

  const setting = await prisma.utilitySetting.findUnique({
    where: { propertyId_utility: { propertyId: meter.propertyId, utility: meter.utility } },
    select: { requirePhoto: true, unitLabel: true },
  });
  if (files.length === 0 && !canSeeUtilityMoney(session!)) {
    if (setting?.requirePhoto) {
      return Response.json({ error: "Take a photo of the meter — it is required for this property.", code: "PHOTO_REQUIRED" }, { status: 400 });
    }
  }

  let photoPaths: string[] = [];
  if (files.length > 0) {
    try {
      photoPaths = await uploadMeterPhotos(meter.id, files);
    } catch (e) {
      if (e instanceof MeterPhotoStorageError) return storageUnavailableResponse();
      throw e;
    }
  }

  const result = await submitReading({ ...parsed.data, readingDate, photoPaths }, session!);
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });

  // Read the number off the photo while the caretaker is still at the meter.
  const photoCheck = files.length
    ? await recordMeterPhotoCheck(result.reading.id, files, {
        utility: meter.utility,
        unitLabel: setting?.unitLabel ?? (meter.utility === "WATER" ? "units" : "kWh"),
        meterNumber: meter.meterNumber,
        previousReading: result.reading.previousReading,
      })
    : null;

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "MeterReading",
    resourceId: result.reading.id,
    organizationId: meter.property.organizationId ?? session!.user.organizationId,
    after: {
      meter: meter.label,
      period: `${parsed.data.periodYear}-${String(parsed.data.periodMonth).padStart(2, "0")}`,
      previousReading: result.reading.previousReading,
      currentReading: result.reading.currentReading,
      consumption: result.reading.consumption,
    },
  });

  return Response.json(
    {
      id: result.reading.id,
      status: result.reading.status,
      previousReading: result.reading.previousReading,
      currentReading: result.reading.currentReading,
      consumption: result.reading.consumption,
      photoReading: photoCheck?.reading ?? null,
      photoReadingNote: photoCheck?.note ?? null,
      photoMismatch: photoReadingMismatch(result.reading.currentReading, photoCheck?.reading),
    },
    { status: 201 },
  );
}
