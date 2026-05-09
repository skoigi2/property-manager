import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const tenant = await validatePortalToken(params.token);
    if (!tenant) {
      return Response.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    const docs = await prisma.tenantDocument.findMany({
      where: { tenantId: tenant.id },
      orderBy: { uploadedAt: "desc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => {
        let url: string | null = null;
        try {
          url = await getSignedUrl(doc.storagePath);
        } catch {
          // storage unavailable for this doc — return null url, client hides Download
        }
        return {
          id: doc.id,
          label: doc.label,
          category: doc.category,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
          url,
        };
      })
    );

    return Response.json(withUrls);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[GET /api/portal/[token]/documents]", message, e instanceof Error ? e.stack : undefined);
    return Response.json(
      { error: "Server error", detail: message, code: (e as { code?: string })?.code ?? null },
      { status: 500 }
    );
  }
}
