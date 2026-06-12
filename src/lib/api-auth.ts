import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/token-utils";

const KEY_PREFIX = "gwpm_";

/** Generates a new raw API key + its stored representation. Raw is shown once. */
export function generateApiKey(): { raw: string; keyHash: string; keyPrefix: string } {
  const raw = KEY_PREFIX + crypto.randomBytes(24).toString("hex");
  return { raw, keyHash: hashToken(raw), keyPrefix: raw.slice(0, 13) };
}

export interface ApiKeyContext {
  organizationId: string;
  apiKeyId: string;
}

/**
 * Authenticates a public-API request via `Authorization: Bearer gwpm_…`.
 * Returns the org context, or a ready-to-return 401 Response.
 */
export async function authenticateApiKey(
  req: Request
): Promise<{ ctx: ApiKeyContext | null; error: Response | null }> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!raw.startsWith(KEY_PREFIX)) {
    return {
      ctx: null,
      error: Response.json(
        { error: "Missing or malformed API key. Pass it as: Authorization: Bearer gwpm_…" },
        { status: 401 }
      ),
    };
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(raw) },
    select: { id: true, organizationId: true, revokedAt: true },
  });
  if (!key || key.revokedAt) {
    return {
      ctx: null,
      error: Response.json({ error: "Invalid or revoked API key." }, { status: 401 }),
    };
  }

  // Best-effort usage stamp — never block the request on it.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ctx: { organizationId: key.organizationId, apiKeyId: key.id }, error: null };
}
