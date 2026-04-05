import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const ORG_BUCKET = "org-assets";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

async function canManageOrg(orgId: string, session: { user: { id: string; role: string; organizationId: string | null } }) {
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  const isOrgAdmin   = session.user.role === "ADMIN" && session.user.organizationId === orgId;
  if (isSuperAdmin || isOrgAdmin) return true;
  // Managers belonging to the org may also manage its logo
  if (session.user.role === "MANAGER") {
    if (session.user.organizationId === orgId) return true;
    const membership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: session.user.id, organizationId: orgId } },
    });
    if (membership) return true;
    const access = await prisma.propertyAccess.findFirst({
      where: { userId: session.user.id, property: { organizationId: orgId } },
    });
    return !!access;
  }
  return false;
}

// ── POST /api/organizations/[id]/logo ────────────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!(await canManageOrg(params.id, session!))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({ where: { id: params.id } });
  if (!org) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("logo") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const storagePath = `orgs/${params.id}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = getStorageClient();

  // Remove any previous logo files for this org
  const { data: existing } = await client.storage.from(ORG_BUCKET).list(`orgs/${params.id}`);
  if (existing?.length) {
    await client.storage.from(ORG_BUCKET).remove(existing.map((f) => `orgs/${params.id}/${f.name}`));
  }

  const { error: uploadErr } = await client.storage
    .from(ORG_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadErr) return Response.json({ error: uploadErr.message }, { status: 500 });

  // Get a public URL (org-assets bucket should be public, or use signed URL)
  const { data: urlData } = client.storage.from(ORG_BUCKET).getPublicUrl(storagePath);
  const logoUrl = urlData.publicUrl;

  const updated = await prisma.organization.update({
    where: { id: params.id },
    data: { logoUrl },
  });

  return Response.json({ logoUrl: updated.logoUrl });
}

// ── DELETE /api/organizations/[id]/logo ──────────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!(await canManageOrg(params.id, session!))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({ where: { id: params.id } });
  if (!org) return Response.json({ error: "Not found" }, { status: 404 });

  if (org.logoUrl) {
    const client = getStorageClient();
    const { data: existing } = await client.storage.from(ORG_BUCKET).list(`orgs/${params.id}`);
    if (existing?.length) {
      await client.storage.from(ORG_BUCKET).remove(existing.map((f) => `orgs/${params.id}/${f.name}`));
    }
  }

  await prisma.organization.update({ where: { id: params.id }, data: { logoUrl: null } });
  return new Response(null, { status: 204 });
}
