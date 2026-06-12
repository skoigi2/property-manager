import { requireAdmin, requireAdminWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

/** GET /api/api-keys — list the org's API keys (admin only; never returns raw keys). */
export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json({ error: "Select an organisation first." }, { status: 400 });

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: orgId },
    select: {
      id: true, name: true, keyPrefix: true, createdByEmail: true,
      lastUsedAt: true, revokedAt: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(keys);
}

const createSchema = z.object({ name: z.string().min(1).max(100) });

/** POST /api/api-keys — mint a key. The raw value appears in this response only. */
export async function POST(req: Request) {
  const { session, error } = await requireAdminWrite();
  if (error) return error;
  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json({ error: "Select an organisation first." }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { raw, keyHash, keyPrefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      organizationId: orgId,
      name: parsed.data.name,
      keyHash,
      keyPrefix,
      createdByEmail: session!.user.email ?? null,
    },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? null,
    action: "CREATE",
    resource: "ApiKey",
    resourceId: key.id,
    after: { name: key.name, keyPrefix: key.keyPrefix },
  });

  return Response.json({ ...key, rawKey: raw }, { status: 201 });
}
