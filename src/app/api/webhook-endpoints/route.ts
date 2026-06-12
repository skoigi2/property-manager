import crypto from "crypto";
import { requireAdmin, requireAdminWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

/** GET /api/webhook-endpoints — list the org's endpoints (admin only). */
export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json({ error: "Select an organisation first." }, { status: 400 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: orgId },
    select: {
      id: true, url: true, events: true, isActive: true,
      lastSuccessAt: true, lastFailureAt: true, failureCount: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ endpoints, availableEvents: WEBHOOK_EVENTS });
}

const createSchema = z.object({
  url: z.string().url().startsWith("https://", "Webhook URLs must be https"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

/** POST /api/webhook-endpoints — register an endpoint. Secret shown once. */
export async function POST(req: Request) {
  const { session, error } = await requireAdminWrite();
  if (error) return error;
  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json({ error: "Select an organisation first." }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const secret = "whsec_" + crypto.randomBytes(24).toString("hex");
  const ep = await prisma.webhookEndpoint.create({
    data: { organizationId: orgId, url: parsed.data.url, events: parsed.data.events, secret },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? null,
    action: "CREATE",
    resource: "WebhookEndpoint",
    resourceId: ep.id,
    after: { url: ep.url, events: ep.events },
  });

  return Response.json({ ...ep, secret }, { status: 201 });
}
