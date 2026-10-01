import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date-utils";

/**
 * WhatsApp versions of the tenant message templates EmailDraftModal offers —
 * plain text, short, WhatsApp *bold* for the amount, no HTML. Client-safe.
 *
 * Keyed by locale so other languages can be added beside "en" (written by a
 * person, never machine-translated); a missing locale falls back to English.
 */
export type WhatsAppTemplate = "rent_reminder" | "payment_receipt" | "renewal_offer" | "expiry_notice";
export type MessageLocale = "en";

export interface WhatsAppMessageContext {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  currency: string;
  /** Who the message is from — the organisation, else the property. */
  senderName: string;
  /** Rent reminder: invoiceReminderFigures / tenantReminderFigures (src/lib/rent-reminder-figures.ts). */
  outstanding: number;
  daysOverdue: number;
  /** "September 2026" when the reminder is about one invoice. */
  periodLabel: string | null;
  /** `${origin}/portal/${token}` — only for a valid, unexpired token. */
  portalUrl: string | null;
  monthlyRent: number;
  serviceCharge: number;
  /** Latest rent payment, for the receipt template. */
  lastPayment: { amount: number; date: string } | null;
  leaseEnd: string | null;
  proposedRent: number | null;
  proposedLeaseEnd: string | null;
}

export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplate, string> = {
  rent_reminder: "Rent Reminder",
  payment_receipt: "Payment Receipt",
  renewal_offer: "Renewal Offer",
  expiry_notice: "Lease Expiry Notice",
};

/** Comms-log subject for a WhatsApp send attempt. */
export const WHATSAPP_LOG_SUBJECTS: Record<WhatsAppTemplate, string> = {
  rent_reminder: "Rent reminder (WhatsApp)",
  payment_receipt: "Payment receipt (WhatsApp)",
  renewal_offer: "Renewal offer (WhatsApp)",
  expiry_notice: "Lease expiry notice (WhatsApp)",
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const EN: Record<WhatsAppTemplate, (c: WhatsAppMessageContext) => string> = {
  rent_reminder: (c) => {
    const fmt = (n: number) => formatCurrency(n, c.currency);
    const where = `Unit ${c.unitNumber}, ${c.propertyName}`;
    const lines =
      c.outstanding > 0
        ? [
            `Hi ${firstName(c.tenantName)},`,
            "",
            `This is a reminder from ${c.senderName} that rent${c.periodLabel ? ` for ${c.periodLabel}` : ""} on ${where} is outstanding: *${fmt(c.outstanding)}*` +
              (c.daysOverdue > 0 ? ` (${c.daysOverdue} day${c.daysOverdue === 1 ? "" : "s"} overdue).` : "."),
          ]
        : [
            `Hi ${firstName(c.tenantName)},`,
            "",
            `A friendly reminder from ${c.senderName} that your rent of *${fmt(c.monthlyRent + c.serviceCharge)}* for ${where} is due this month.`,
          ];
    if (c.portalUrl) lines.push("", `View your statement and payment details here: ${c.portalUrl}`);
    lines.push("", "If you have already paid, please ignore this message. Thank you.");
    return lines.join("\n");
  },

  payment_receipt: (c) => {
    const fmt = (n: number) => formatCurrency(n, c.currency);
    const paid = c.lastPayment
      ? `your payment of *${fmt(c.lastPayment.amount)}* received on ${formatDate(c.lastPayment.date)}`
      : `your rent payment of *${fmt(c.monthlyRent + c.serviceCharge)}*`;
    const lines = [
      `Hi ${firstName(c.tenantName)},`,
      "",
      `${c.senderName} confirms ${paid} for Unit ${c.unitNumber}, ${c.propertyName}. Thank you!`,
    ];
    if (c.portalUrl) lines.push("", `Your receipts are in your tenant portal: ${c.portalUrl}`);
    return lines.join("\n");
  },

  renewal_offer: (c) => {
    const fmt = (n: number) => formatCurrency(n, c.currency);
    const rent = c.proposedRent ?? c.monthlyRent;
    const lines = [
      `Hi ${firstName(c.tenantName)},`,
      "",
      `Your lease for Unit ${c.unitNumber}, ${c.propertyName}${c.leaseEnd ? ` ends on ${formatDate(c.leaseEnd)}` : " is coming to an end"}. ${c.senderName} would like to offer you a renewal:`,
      "",
      `• Monthly rent: *${fmt(rent)}*${c.serviceCharge > 0 ? ` + ${fmt(c.serviceCharge)} service charge` : ""}`,
      `• New lease end: ${c.proposedLeaseEnd ? formatDate(c.proposedLeaseEnd) : "to be agreed"}`,
      "",
      "Please reply to confirm, or let us know if you'd like to discuss.",
    ];
    if (c.portalUrl) lines.push("", `Tenant portal: ${c.portalUrl}`);
    return lines.join("\n");
  },

  expiry_notice: (c) => {
    const lines = [
      `Hi ${firstName(c.tenantName)},`,
      "",
      `This is a notice from ${c.senderName} that your lease for Unit ${c.unitNumber}, ${c.propertyName} expires on *${c.leaseEnd ? formatDate(c.leaseEnd) : "the agreed date"}*.`,
      "",
      "Please let us know within 14 days whether you plan to renew or move out on that date.",
    ];
    if (c.portalUrl) lines.push("", `Tenant portal: ${c.portalUrl}`);
    return lines.join("\n");
  },
};

export const WHATSAPP_TEMPLATES: Record<MessageLocale, Record<WhatsAppTemplate, (c: WhatsAppMessageContext) => string>> = {
  en: EN,
};

export function buildWhatsAppMessage(
  template: WhatsAppTemplate,
  ctx: WhatsAppMessageContext,
  locale: string = "en",
): string {
  const set = WHATSAPP_TEMPLATES[locale as MessageLocale] ?? WHATSAPP_TEMPLATES.en;
  return set[template](ctx);
}
