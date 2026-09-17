import { requireOpsStaffWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateReadingSchema } from "@/lib/validations";
import { updateReading } from "@/lib/utility-readings";
import {
  MeterPhotoStorageError,
  parseReadingRequest,
  storageUnavailableResponse,
  uploadMeterPhotos,
  validateMeterPhotos,
} from "@/lib/meter-photos";

export const maxDuration = 30;

/**
 * PATCH /api/utilities/readings/[id] — correct a reading (JSON or multipart
 * with extra `photo` files). Ops staff incl. CARETAKER: a caretaker may change
 * only their own reading while it is still SUBMITTED; a manager may change any
 * reading that is not on an invoice, which sends it back for approval.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const reading = await prisma.meterReading.findUnique({
    where: { id: params.id },
    select: {
      id: true, photoPaths: true, currentReading: true, previousReading: true,
      meter: { select: { id: true, propertyId: true, label: true, property: { select: { organizationId: true } } } },
    },
  });
  if (!reading) return Response.json({ error: "Reading not found" }, { status: 404 });
  const access = await requirePropertyAccess(reading.meter.propertyId);
  if (!access.ok) return access.error!;

  const { fields, files } = await parseReadingRequest(req);
  const parsed = updateReadingSchema.safeParse(fields);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid reading" }, { status: 400 });
  }
  let readingDate: Date | undefined;
  if (parsed.data.readingDate) {
    readingDate = new Date(parsed.data.readingDate);
    if (isNaN(readingDate.getTime())) return Response.json({ error: "Invalid reading date" }, { status: 400 });
  }

  const photoError = validateMeterPhotos(
    files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    reading.photoPaths.length,
  );
  if (photoError) return Response.json({ error: photoError }, { status: 400 });

  let addPhotoPaths: string[] = [];
  if (files.length > 0) {
    try {
      addPhotoPaths = await uploadMeterPhotos(reading.meter.id, files);
    } catch (e) {
      if (e instanceof MeterPhotoStorageError) return storageUnavailableResponse();
      throw e;
    }
  }

  const result = await updateReading(params.id, { ...parsed.data, readingDate, addPhotoPaths }, session!);
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "MeterReading",
    resourceId: params.id,
    organizationId: reading.meter.property.organizationId ?? session!.user.organizationId,
    before: { previousReading: reading.previousReading, currentReading: reading.currentReading },
    after: {
      meter: reading.meter.label,
      previousReading: result.reading.previousReading,
      currentReading: result.reading.currentReading,
      consumption: result.reading.consumption,
    },
  });

  return Response.json({
    id: result.reading.id,
    status: result.reading.status,
    previousReading: result.reading.previousReading,
    currentReading: result.reading.currentReading,
    consumption: result.reading.consumption,
  });
}
