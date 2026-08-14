import { requireManager, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { assertGuestAccess } from "@/lib/guest-access";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED  = ["application/pdf","image/jpeg","image/png","image/webp",
                  "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const access = await assertGuestAccess(params.id, session!.user.organizationId);
  if (access.error) return access.error;

  const docs = await prisma.guestDocument.findMany({
    where: { guestId: params.id },
    orderBy: { uploadedAt: "desc" },
  });

  const withUrls = await Promise.all(
    docs.map(async (d) => {
      try {
        const url = await getSignedUrl(d.storagePath);
        return { ...d, url };
      } catch {
        return { ...d, url: null };
      }
    })
  );

  return Response.json(withUrls);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  // Verify the guest exists AND belongs to the caller's org
  const access = await assertGuestAccess(params.id, session!.user.organizationId);
  if (access.error) return access.error;

  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file  = formData.get("file") as File | null;
  const label = (formData.get("label") as string | null) || null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return Response.json({ error: "File type not allowed" }, { status: 400 });

  const buffer      = Buffer.from(await file.arrayBuffer());
  const timestamp   = Date.now();
  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `guests/${params.id}/${timestamp}-${safeName}`;

  await uploadToStorage(storagePath, buffer, file.type);

  const doc = await prisma.guestDocument.create({
    data: {
      guestId:     params.id,
      label:       label || file.name,
      fileName:    file.name,
      storagePath,
      fileSize:    file.size,
      mimeType:    file.type,
    },
  });

  return Response.json(doc, { status: 201 });
}
