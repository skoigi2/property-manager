import "server-only";
import { uploadToStorage, deleteFromStorage } from "@/lib/supabase-storage";

/**
 * Meter-reading photos: the caretaker photographs the dial so the manager can
 * check the typed number before approving. Files live in the private
 * `tenant-documents` bucket under meter-readings/<meterId>/ and are only ever
 * served through short-lived signed URLs.
 */

export const METER_PHOTO_MAX_FILES = 3;
export const METER_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export class MeterPhotoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeterPhotoStorageError";
  }
}

export function storageUnavailableResponse(): Response {
  return Response.json(
    {
      error: "The photo could not be saved — file storage is unavailable. Try again, or submit the reading without a photo.",
      code: "STORAGE_UNAVAILABLE",
    },
    { status: 503 },
  );
}

/** Null when the files are acceptable, else a user-facing reason. */
export function validateMeterPhotos(files: { name: string; size: number; type: string }[], alreadyAttached = 0): string | null {
  if (files.length + alreadyAttached > METER_PHOTO_MAX_FILES) {
    return `A reading can carry at most ${METER_PHOTO_MAX_FILES} photos.`;
  }
  for (const f of files) {
    if (f.size > METER_PHOTO_MAX_BYTES) return `${f.name} is larger than 10 MB.`;
    // Phones often send HEIC with an empty MIME type — fall back to the extension.
    const ok = f.type ? IMAGE_TYPES.includes(f.type.toLowerCase()) : IMAGE_EXT.test(f.name);
    if (!ok) return `${f.name} is not an image. Photos must be JPG, PNG, WebP or HEIC.`;
  }
  return null;
}

export interface ParsedReadingRequest {
  fields: Record<string, unknown>;
  files: File[];
}

const NUMERIC_FIELDS = ["periodYear", "periodMonth", "currentReading", "previousOverride"];

/** Accepts JSON, or multipart/form-data with `photo` files beside the fields. */
export async function parseReadingRequest(req: Request): Promise<ParsedReadingRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return { fields: (await req.json().catch(() => ({}))) as Record<string, unknown>, files: [] };
  }
  const form = await req.formData();
  const fields: Record<string, unknown> = {};
  form.forEach((v, k) => {
    if (typeof v !== "string" || k === "photo") return;
    if (NUMERIC_FIELDS.includes(k)) {
      if (v.trim() !== "") fields[k] = Number(v);
    } else {
      fields[k] = v;
    }
  });
  const files = form.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  return { fields, files };
}

/**
 * Uploads every photo or none: a failure removes what was already stored and
 * throws, so a reading is never saved pointing at half of its photos.
 */
export async function uploadMeterPhotos(meterId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "photo.jpg";
      const path = `meter-readings/${meterId}/${Date.now()}-${paths.length}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadToStorage(path, buffer, file.type || "image/jpeg");
      paths.push(path);
    }
    return paths;
  } catch (e) {
    await Promise.allSettled(paths.map((p) => deleteFromStorage(p)));
    throw new MeterPhotoStorageError(e instanceof Error ? e.message : "upload failed");
  }
}
