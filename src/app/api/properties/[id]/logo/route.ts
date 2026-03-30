import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const ORG_BUCKET = "org-assets";

function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── POST /api/properties/[id]/logo ───────────────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (!ids?.includes(params.id)) return Response.json({ error: "Not found" }, { status: 404 });

  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("logo") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const orgId = property.organizationId ?? "no-org";
  const storagePath = `orgs/${orgId}/properties/${params.id}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = getStorageClient();

  // Remove previous logo files for this property
  const { data: existing } = await client.storage
    .from(ORG_BUCKET)
    .list(`orgs/${orgId}/properties/${params.id}`);
  if (existing?.length) {
    await client.storage
      .from(ORG_BUCKET)
      .remove(existing.map((f) => `orgs/${orgId}/properties/${params.id}/${f.name}`));
  }

  const { error: uploadErr } = await client.storage
    .from(ORG_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) return Response.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = client.storage.from(ORG_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  await prisma.property.update({ where: { id: params.id }, data: { logoUrl } });
  return Response.json({ logoUrl });
}

// ── DELETE /api/properties/[id]/logo ─────────────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (!ids?.includes(params.id)) return Response.json({ error: "Not found" }, { status: 404 });

  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property?.logoUrl) return new Response(null, { status: 204 });

  const orgId = property.organizationId ?? "no-org";
  const client = getStorageClient();
  const { data: existing } = await client.storage
    .from(ORG_BUCKET)
    .list(`orgs/${orgId}/properties/${params.id}`);
  if (existing?.length) {
    await client.storage
      .from(ORG_BUCKET)
      .remove(existing.map((f) => `orgs/${orgId}/properties/${params.id}/${f.name}`));
  }

  await prisma.property.update({ where: { id: params.id }, data: { logoUrl: null } });
  return new Response(null, { status: 204 });
}
