"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import {
  buildWhatsAppMessage,
  WHATSAPP_LOG_SUBJECTS,
  type WhatsAppMessageContext,
  type WhatsAppTemplate,
} from "@/lib/whatsapp-messages";

/** GET /api/tenants/[id]/whatsapp — fetched before the tap, so the chat opens straight from it. */
export interface WhatsAppTarget {
  tenantId: string;
  invoiceId: string | null;
  phone: { raw: string | null; digits: string | null; dialCode: string | null };
  /** A valid (unexpired) portal token, else null. */
  portalToken: string | null;
  context: Omit<WhatsAppMessageContext, "portalUrl">;
}

export async function loadWhatsAppTarget(tenantId: string, invoiceId?: string | null): Promise<WhatsAppTarget> {
  const qs = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : "";
  const res = await fetch(`/api/tenants/${tenantId}/whatsapp${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't load the tenant's WhatsApp details");
  return data as WhatsAppTarget;
}

export function useWhatsAppTarget(tenantId: string | null | undefined, invoiceId?: string | null) {
  const [data, setData] = useState<WhatsAppTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await loadWhatsAppTarget(tenantId, invoiceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the tenant's WhatsApp details");
    } finally {
      setLoading(false);
    }
  }, [tenantId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, loading, error, reload: load };
}

/** The tenant portal URL on this deployment's own origin. */
export function portalUrlFor(token: string | null): string | null {
  return token && typeof window !== "undefined" ? `${window.location.origin}/portal/${token}` : null;
}

export function whatsAppMessageFor(target: WhatsAppTarget, template: WhatsAppTemplate, portalToken = target.portalToken): string {
  return buildWhatsAppMessage(template, { ...target.context, portalUrl: portalUrlFor(portalToken) });
}

/**
 * When the link can only be built after a request (creating the portal
 * link), open the tab during the tap — Safari blocks window.open after an
 * await — detached from this page (opener cleared, as "noopener" would),
 * then point it at WhatsApp. Close it if the request fails.
 */
export function reserveTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

/** Creates (or rotates) the tenant's portal link — only ever on the manager's explicit tap. */
export async function createPortalToken(tenantId: string): Promise<string> {
  const res = await fetch(`/api/tenants/${tenantId}/portal-token`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.portalToken) throw new Error(typeof data.error === "string" ? data.error : "Couldn't create the portal link");
  return data.portalToken as string;
}

/**
 * Opens WhatsApp (app on a phone, WhatsApp Web / Desktop on a computer) with
 * the message, then logs the send ATTEMPT to the tenant's Comms tab —
 * fire-and-forget, like the email path; delivery can't be confirmed.
 * Must run inside the tap's handler: browsers only allow a new tab from it.
 */
export function openWhatsApp(
  target: WhatsAppTarget,
  template: WhatsAppTemplate,
  opts: { portalToken?: string | null; caseThreadId?: string | null; tab?: Window | null } = {},
): string {
  if (!target.phone.digits) throw new Error("No usable phone number");
  const message = whatsAppMessageFor(target, template, opts.portalToken !== undefined ? opts.portalToken : target.portalToken);
  const url = buildWhatsAppLink(target.phone.digits, message);
  if (opts.tab) opts.tab.location.href = url; // a tab opened during the tap (see reserveTab)
  else window.open(url, "_blank", "noopener");

  fetch(`/api/tenants/${target.tenantId}/communication-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "WHATSAPP",
      subject: WHATSAPP_LOG_SUBJECTS[template],
      body: message.slice(0, 5000),
      templateUsed: template,
      caseThreadId: opts.caseThreadId ?? undefined,
    }),
  })
    .then((r) => {
      if (r.ok) toast.success("WhatsApp opened — logged as a send attempt");
    })
    .catch(() => {});
  return message;
}
