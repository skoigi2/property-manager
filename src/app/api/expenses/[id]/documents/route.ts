import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { ExpenseDocumentCategory } from "@prisma/client";

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
  const { error } = await requireAuth();
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
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const resolvedPropertyId = await resolvePropertyId(params.id);

  if (resolvedPropertyId) {
    const accessibleIds = await getAccessiblePropertyIds();
    if (!accessibleIds || !accessibleIds.includes(resolvedPropertyId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    const { error: mgErr } = await requireManager();
    if (mgErr) return mgErr;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) ?? "OTHER";
  const label = (formData.get("label") as string) ?? "";

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const maxMb = 10;
  if (file.size > maxMb * 1024 * 1024) {
    return Response.json({ error: `File too large (max ${maxMb} MB)` }, { status: 400 });
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `expenses/${params.id}/${Date.now()}-${safeFileName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadToStorage(storagePath, buffer, file.type);
  } catch (e: any) {
    return Response.json({ error: `Storage upload failed: ${e.message}` }, { status: 500 });
  }

  const doc = await prisma.expenseDocument.create({
    data: {
      expenseId: params.id,
      category: category as ExpenseDocumentCategory,
      label: label || file.name,
      fileName: file.name,
      storagePath,
      fileSize: file.size,
      mimeType: file.type,
    },
  });

  return Response.json(doc, { status: 201 });
}
