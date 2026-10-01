"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { TutorialVideo } from "@/components/ui/TutorialVideo";
import { WhatsAppSendButton } from "./WhatsAppSendButton";
import { useWhatsAppTarget, whatsAppMessageFor } from "./use-whatsapp";
import { displayWhatsAppNumber } from "@/lib/whatsapp";
import { WHATSAPP_TEMPLATE_LABELS, type WhatsAppTemplate } from "@/lib/whatsapp-messages";

const ALL_TEMPLATES: WhatsAppTemplate[] = ["rent_reminder", "payment_receipt", "renewal_offer", "expiry_notice"];

interface Props {
  tenantId: string;
  /** Scope the rent reminder to one invoice (Inbox overdue item). */
  invoiceId?: string | null;
  templates?: WhatsAppTemplate[];
  initialTemplate?: WhatsAppTemplate;
  caseThreadId?: string | null;
  onClose: () => void;
  onSent?: () => void;
}

/** Preview + send a WhatsApp message to one tenant (tenant header, Inbox overdue item). */
export function WhatsAppModal({
  tenantId, invoiceId, templates = ALL_TEMPLATES, initialTemplate, caseThreadId, onClose, onSent,
}: Props) {
  const [template, setTemplate] = useState<WhatsAppTemplate>(initialTemplate ?? templates[0]);
  const { data, setData, loading, error } = useWhatsAppTarget(tenantId, invoiceId);
  const message = data ? whatsAppMessageFor(data, template) : "";

  return (
    <Modal open onClose={onClose} title="Send via WhatsApp" size="md">
      <div className="p-5 space-y-4">
        {templates.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {templates.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTemplate(t)}
                className={`px-3 py-1.5 rounded-full text-caption font-medium transition-colors ${
                  template === t ? "bg-gold text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {WHATSAPP_TEMPLATE_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        {loading && !data ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : error ? (
          <p className="text-body text-expense">{error}</p>
        ) : data ? (
          <>
            <div>
              <p className="text-label text-gray-400 uppercase">To</p>
              {data.phone.digits ? (
                <p className="text-body text-gray-700 mt-0.5">
                  {data.context.tenantName} · <span className="tabular-nums">{displayWhatsAppNumber(data.phone.digits)}</span>
                </p>
              ) : (
                <p className="text-body text-amber-700 mt-0.5">
                  {data.phone.raw
                    ? `"${data.phone.raw}" can't be used on WhatsApp — add the number with its country code (e.g. +254 712 345 678).`
                    : "No phone number on file — add one with its country code."}
                </p>
              )}
            </div>
            <div>
              <p className="text-label text-gray-400 uppercase">Message</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-body text-gray-700 bg-cream rounded-xl p-4">{message}</p>
              {!data.portalToken && (
                <p className="text-caption text-gray-400 mt-1.5">
                  The tenant has no active portal link. &ldquo;Create portal link &amp; send&rdquo; makes one and adds it to the message.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <WhatsAppSendButton
                target={data}
                template={template}
                caseThreadId={caseThreadId}
                variant="gold"
                onPortalCreated={(token) => setData({ ...data, portalToken: token })}
                onSent={() => {
                  onSent?.();
                  onClose();
                }}
              />
            </div>
            <p className="text-caption text-gray-400">
              Opens WhatsApp with this message — you press send there. It is logged on the tenant&apos;s Comms tab as a
              send attempt: WhatsApp doesn&apos;t tell us whether it was delivered.
            </p>
            <TutorialVideo tutorialKey="whatsapp-reminders" variant="link" />
          </>
        ) : null}
      </div>
    </Modal>
  );
}
