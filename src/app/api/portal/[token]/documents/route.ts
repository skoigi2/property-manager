import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const docs = await prisma.tenantDocument.findMany({
    where: { tenantId: tenant.id },
    orderBy: { uploadedAt: "desc" },
  });

  const withUrls = await Promise.all(
    docs.map(async (doc) => ({
      id: doc.id,
      label: doc.label,
      category: doc.category,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt,
      url: await getSignedUrl(doc.storagePath),
    }))
  );

  return Response.json(withUrls);
}
