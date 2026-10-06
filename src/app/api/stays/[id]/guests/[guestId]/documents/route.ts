import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadToStorage } from "@/lib/supabase-storage";
import { loadStay, serializeStay } from "@/lib/stays";

// Upload a guest's ID (photo or PDF) on site — ops staff incl. CARETAKER.
// Same storage as the manager's guest documents (guests/<guestId>/…, private
// bucket, signed on read). The uploader is recorded so a caretaker can delete
// only their own uploads.

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function POST(req: Request, props: { params: Promise<{ id: string; guestId: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadStay(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.entry.bookingGuests.some((bg) => bg.guest.id === params.guestId)) {
    return Response.json({ error: "Guest not found on this stay" }, { status: 404 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Invalid form data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "File exceeds 10 MB" }, { status: 400 });
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? "image/heic" : "");
  if (!ALLOWED.includes(type)) return Response.json({ error: "Upload a photo or a PDF" }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "id.jpg";
  const storagePath = `guests/${params.guestId}/${Date.now()}-${safeName}`;
  try {
    await uploadToStorage(storagePath, Buffer.from(await file.arrayBuffer()), type);
  } catch (e) {
    console.error("[stays] guest ID upload failed:", e);
    return Response.json({ error: "File storage isn't available right now — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  const label = String(form.get("label") ?? "").trim().slice(0, 80) || "ID document";
  const doc = await prisma.guestDocument.create({
    data: {
      guestId: params.guestId, label, fileName: file.name || safeName, storagePath,
      fileSize: file.size, mimeType: type, uploadedByUserId: session!.user.id,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "GuestDocument",
    resourceId: doc.id,
    organizationId: loaded.entry.unit.property.organizationId,
    after: { guestId: params.guestId, bookingId: loaded.entry.id, label },
  });

  const reloaded = await loadStay(loaded.entry.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json(await serializeStay(reloaded.entry, session!), { status: 201 });
}
