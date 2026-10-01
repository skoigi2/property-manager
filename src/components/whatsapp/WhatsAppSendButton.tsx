"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { HelpTip } from "@/components/ui/HelpTip";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { createPortalToken, openWhatsApp, reserveTab, type WhatsAppTarget } from "./use-whatsapp";
import { PORTAL_LINK_REQUIRED, type WhatsAppTemplate } from "@/lib/whatsapp-messages";

interface Props {
  target: WhatsAppTarget | null;
  loading?: boolean;
  template: WhatsAppTemplate;
  caseThreadId?: string | null;
  /** After WhatsApp opened (the message as sent). */
  onSent?: (message: string) => void;
  /** A portal link was just created — keep the caller's copy of the target current. */
  onPortalCreated?: (token: string) => void;
  size?: "sm" | "md";
  variant?: "secondary" | "gold";
}

/**
 * The one WhatsApp send control:
 * - no usable phone → disabled, with a HelpTip;
 * - no valid portal link → "Create portal link & send" (never created
 *   silently), or send without it (not for a template that is the link);
 * - otherwise "Send via WhatsApp".
 */
export function WhatsAppSendButton({
  target, loading, template, caseThreadId, onSent, onPortalCreated, size = "md", variant = "secondary",
}: Props) {
  const [busy, setBusy] = useState(false);

  if (loading || !target) {
    return (
      <Button variant={variant} size={size} disabled loading={loading}>
        <WhatsAppIcon /> Send via WhatsApp
      </Button>
    );
  }

  if (!target.phone.digits) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Button variant={variant} size={size} disabled>
          <WhatsAppIcon /> Send via WhatsApp
        </Button>
        <HelpTip text="Add a phone number with country code" />
      </span>
    );
  }

  function send(portalToken?: string | null, tab?: Window | null) {
    try {
      const message = openWhatsApp(target!, template, { portalToken, caseThreadId, tab });
      onSent?.(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open WhatsApp");
    }
  }

  if (!target.portalToken) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Button
          variant={variant}
          size={size}
          loading={busy}
          onClick={async () => {
            const tab = reserveTab();
            setBusy(true);
            try {
              const token = await createPortalToken(target.tenantId);
              onPortalCreated?.(token);
              send(token, tab);
            } catch (e) {
              tab?.close();
              toast.error(e instanceof Error ? e.message : "Couldn't create the portal link");
            } finally {
              setBusy(false);
            }
          }}
        >
          <WhatsAppIcon /> Create portal link &amp; send
        </Button>
        {!PORTAL_LINK_REQUIRED.has(template) && (
          <button
            type="button"
            onClick={() => send(null)}
            className="text-caption text-gray-500 hover:text-header underline underline-offset-2"
          >
            Send without the link
          </button>
        )}
      </span>
    );
  }

  return (
    <Button variant={variant} size={size} onClick={() => send()}>
      <WhatsAppIcon /> Send via WhatsApp
    </Button>
  );
}
