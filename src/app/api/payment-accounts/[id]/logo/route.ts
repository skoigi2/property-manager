import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

// Mirrors /api/properties/[id]/logo — same bucket, per-account folder.
const ORG_BUCKET = "org-assets";

function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function loadOwnedAccount(id: string, orgId: string | null | undefined) {
  if (!orgId) return null;
  const account = await prisma.paymentAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== orgId) return null;
  return account;
}

// ── POST /api/payment-accounts/[id]/logo ─────────────────────────────────────
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const account = await loadOwnedAccount(params.id, session!.user.organizationId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("logo") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const folder = `orgs/${account.organizationId}/payment-accounts/${params.id}`;
  const storagePath = `${folder}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = getStorageClient();

  // Remove previous logo files for this account
  const { data: existing } = await client.storage.from(ORG_BUCKET).list(folder);
  if (existing?.length) {
    await client.storage.from(ORG_BUCKET).remove(existing.map((f) => `${folder}/${f.name}`));
  }

  const { error: uploadErr } = await client.storage
    .from(ORG_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) return Response.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = client.storage.from(ORG_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  await prisma.paymentAccount.update({ where: { id: params.id }, data: { logoUrl } });
  return Response.json({ logoUrl });
}

// ── DELETE /api/payment-accounts/[id]/logo ───────────────────────────────────
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const account = await loadOwnedAccount(params.id, session!.user.organizationId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });
  if (!account.logoUrl) return new Response(null, { status: 204 });

  const folder = `orgs/${account.organizationId}/payment-accounts/${params.id}`;
  const client = getStorageClient();
  const { data: existing } = await client.storage.from(ORG_BUCKET).list(folder);
  if (existing?.length) {
    await client.storage.from(ORG_BUCKET).remove(existing.map((f) => `${folder}/${f.name}`));
  }

  await prisma.paymentAccount.update({ where: { id: params.id }, data: { logoUrl: null } });
  return new Response(null, { status: 204 });
}
