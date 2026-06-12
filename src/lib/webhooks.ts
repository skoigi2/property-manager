import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** Event names orgs can subscribe to. Extend alongside the dispatch call sites. */
export const WEBHOOK_EVENTS = ["invoice.paid", "maintenance.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Delivers an event to every active endpoint of the org subscribed to it.
 * Fire-and-forget: call as `void dispatchWebhookEvent(...)` after the parent
 * transaction commits — failures are recorded on the endpoint, never thrown.
 *
 * Payload signature: `X-GWPM-Signature: sha256=<hmac-sha256(secret, body)>`.
 */
export async function dispatchWebhookEvent(
  organizationId: string | null | undefined,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  if (!organizationId) return;
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId, isActive: true, events: { has: event } },
    });
    if (endpoints.length === 0) return;

    const body = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    await Promise.allSettled(
      endpoints.map(async (ep) => {
        const signature =
          "sha256=" + crypto.createHmac("sha256", ep.secret).update(body).digest("hex");
        try {
          const res = await fetch(ep.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-GWPM-Event": event,
              "X-GWPM-Signature": signature,
            },
            body,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await prisma.webhookEndpoint.update({
            where: { id: ep.id },
            data: { lastSuccessAt: new Date(), failureCount: 0 },
          });
        } catch {
          await prisma.webhookEndpoint
            .update({
              where: { id: ep.id },
              data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
            })
            .catch(() => {});
        }
      })
    );
  } catch (err) {
    console.error("[webhooks] dispatch failed:", err);
  }
}
