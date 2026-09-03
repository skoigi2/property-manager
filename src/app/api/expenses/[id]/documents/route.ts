import { createHash } from "crypto";
import { requireSession, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireExpenseMutation } from "@/lib/expense-access";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { ExpenseDocumentCategory } from "@prisma/client";

export const maxDuration = 60; // multi-file batches upload sequentially

async function resolvePropertyId(expenseId: string): Promise<string | null> {
  const expense = await prisma.expenseEntry.findUnique({
    where: { id: expenseId },
    include: { unit: { select: { propertyId: true } } },
  });
  if (!expense) return null;
  return expense.propertyId ?? expense.unit?.propertyId ?? null;
}

// ── GET /api/expenses/[id]/documents ──────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // Any role incl. CARETAKER — receipts on an accessible property's expense.
  const { error } = await requireSession();
  if (error) return error;

  const resolvedPropertyId = await resolvePropertyId(params.id);

  if (resolvedPropertyId) {
    const accessibleIds = await getAccessiblePropertyIds();
    if (!accessibleIds || !accessibleIds.includes(resolvedPropertyId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    // PORTFOLIO-scope expense — require manager/accountant
    const { error: mgErr } = await requireManager();
    if (mgErr) return mgErr;
  }

  const docs = await prisma.expenseDocument.findMany({
    where: { expenseId: params.id },
    orderBy: { uploadedAt: "desc" },
  });

  const withUrls = await Promise.all(
    docs.map(async (doc) => {
      let url: string | null = null;
      try {
        url = await getSignedUrl(doc.storagePath);
      } catch {
        // storage unavailable — return null url
      }
      return { ...doc, url };
    })
  );

  return Response.json(withUrls);
}

// ── POST /api/expenses/[id]/documents ─────────────────────────────────────────
const MAX_MB = 10;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  // Legacy: quotes/contracts uploaded as Word docs keep working.
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Some browsers give HEIC files an empty MIME type — fall back to the extension.
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif|docx?)$/i;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  // Auth + property/org access + CARETAKER own-row rule in one place.
  const { session, error } = await requireExpenseMutation(params.id, "attach");
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) ?? "OTHER";
  const label = (formData.get("label") as string) ?? "";

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  if (file.size > MAX_MB * 1024 * 1024) {
    return Response.json(
      { error: `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — the maximum is ${MAX_MB} MB per file.` },
      { status: 400 },
    );
  }

  const typeOk = file.type
    ? ALLOWED_TYPES.has(file.type)
    : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) {
    return Response.json(
      { error: `"${file.name}" is not a supported file type. Upload an image (JPG, PNG, HEIC, WebP) or a PDF.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Content-hash dedupe: the identical file can't be attached to the same
  // expense twice (renaming it doesn't evade the check).
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const duplicate = await prisma.expenseDocument.findUnique({
    where: { expenseId_checksum: { expenseId: params.id, checksum } },
    select: { fileName: true },
  });
  if (duplicate) {
    return Response.json(
      { error: `This file is already attached to this expense (as "${duplicate.fileName}").` },
      { status: 409 },
    );
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `expenses/${params.id}/${Date.now()}-${safeFileName}`;

  try {
    await uploadToStorage(storagePath, buffer, file.type || "application/octet-stream");
  } catch (e: any) {
    return Response.json({ error: `Storage upload failed: ${e.message}` }, { status: 500 });
  }

  try {
    const doc = await prisma.expenseDocument.create({
      data: {
        expenseId: params.id,
        category: category as ExpenseDocumentCategory,
        label: label || file.name,
        fileName: file.name,
        storagePath,
        fileSize: file.size,
        mimeType: file.type || null,
        checksum,
        uploadedByEmail: session!.user.email ?? null,
        uploadedByName: session!.user.name ?? null,
      },
    });
    const url = await getSignedUrl(storagePath).catch(() => null);
    return Response.json({ ...doc, url }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: `Database error: ${e.message}` }, { status: 500 });
  }
}
