"use client";
import { useState } from "react";
import { X, Copy, Check, Mail, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { formatKSh } from "@/lib/currency";

type Template = "rent_reminder" | "payment_receipt" | "renewal_offer" | "expiry_notice";

interface Props {
  tenant: {
    name:        string;
    email:       string | null;
    monthlyRent: number;
    serviceCharge: number;
    leaseEnd:    string | null;
    proposedRent:     number | null;
    proposedLeaseEnd: string | null;
  };
  onClose: () => void;
}

const TEMPLATES: { value: Template; label: string }[] = [
  { value: "rent_reminder",  label: "Rent Reminder" },
  { value: "payment_receipt", label: "Payment Receipt" },
  { value: "renewal_offer",  label: "Renewal Offer" },
  { value: "expiry_notice",  label: "Lease Expiry Notice" },
];

function buildDraft(template: Template, tenant: Props["tenant"]): { subject: string; body: string } {
  const firstName = tenant.name.split(" ")[0];
  const total     = tenant.monthlyRent + tenant.serviceCharge;
  const today     = new Date();
  const monthName = today.toLocaleString("en-KE", { month: "long", year: "numeric" });

  switch (template) {
    case "rent_reminder":
      return {
        subject: `Rent Reminder — ${monthName}`,
        body: `Dear ${firstName},

I hope this message finds you well.

This is a friendly reminder that your monthly rent of ${formatKSh(tenant.monthlyRent)}${tenant.serviceCharge > 0 ? ` plus service charge of ${formatKSh(tenant.serviceCharge)} (total ${formatKSh(total)})` : ""} is due for ${monthName}.

Please ensure payment is made to the usual account by the 5th of the month.

Do not hesitate to reach out if you have any questions or concerns.

Kind regards,
Property Management`,
      };

    case "payment_receipt":
      return {
        subject: `Payment Acknowledgement — ${monthName}`,
        body: `Dear ${firstName},

We acknowledge receipt of your rental payment for ${monthName}.

Payment: ${formatKSh(total)}
Month: ${monthName}
Status: Received ✓

Thank you for your prompt payment.

Kind regards,
Property Management`,
      };

    case "renewal_offer": {
      const proposedRent    = tenant.proposedRent ?? tenant.monthlyRent;
      const proposedLeaseEnd = tenant.proposedLeaseEnd
        ? formatDate(tenant.proposedLeaseEnd)
        : "to be agreed";
      return {
        subject: `Lease Renewal Offer — ${tenant.name}`,
        body: `Dear ${firstName},

Your current lease is approaching its end date${tenant.leaseEnd ? ` on ${formatDate(tenant.leaseEnd)}` : ""}.

We are pleased to offer you a renewal on the following terms:

  • New monthly rent:    ${formatKSh(proposedRent)}
  • Service charge:     ${formatKSh(tenant.serviceCharge)}
  • Total monthly:      ${formatKSh(proposedRent + tenant.serviceCharge)}
  • New lease end date: ${proposedLeaseEnd}

Please confirm your acceptance of these terms or let us know if you wish to discuss.

Kind regards,
Property Management`,
      };
    }

    case "expiry_notice":
      return {
        subject: `Lease Expiry Notice — ${tenant.name}`,
        body: `Dear ${firstName},

This is to notify you that your current lease agreement is due to expire on ${tenant.leaseEnd ? formatDate(tenant.leaseEnd) : "the agreed date"}.

Please advise at your earliest convenience whether you intend to:

  a) Renew your tenancy (subject to new terms)
  b) Vacate the premises on the expiry date

Kindly respond within 14 days of receiving this notice to allow us to make the necessary arrangements.

Should you have any questions, please do not hesitate to contact us.

Kind regards,
Property Management`,
      };
  }
}

export function EmailDraftModal({ tenant, onClose }: Props) {
  const [template, setTemplate]   = useState<Template>("rent_reminder");
  const [copied, setCopied]       = useState(false);
  const draft = buildDraft(template, tenant);

  async function copyBody() {
    await navigator.clipboard.writeText(draft.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mailtoLink = tenant.email
    ? `mailto:${tenant.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-gold" />
            <h3 className="font-display text-lg text-header">Email Draft</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Template picker */}
          <div className="flex gap-2 flex-wrap">
            {TEMPLATES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTemplate(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-sans font-medium transition-colors ${
                  template === t.value
                    ? "bg-gold text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* To field */}
          {tenant.email && (
            <div>
              <label className="text-xs text-gray-400 font-sans uppercase tracking-wide">To</label>
              <p className="text-sm font-sans text-gray-700 mt-0.5">{tenant.email}</p>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="text-xs text-gray-400 font-sans uppercase tracking-wide">Subject</label>
            <p className="text-sm font-sans font-medium text-header mt-0.5">{draft.subject}</p>
          </div>

          {/* Body */}
          <div>
            <label className="text-xs text-gray-400 font-sans uppercase tracking-wide">Body</label>
            <pre className="mt-1.5 whitespace-pre-wrap text-sm font-sans text-gray-700 bg-cream rounded-xl p-4 leading-relaxed">
              {draft.body}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={copyBody}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check size={14} className="text-income" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy body"}
            </button>
            {mailtoLink && (
              <a
                href={mailtoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-gold text-white text-sm font-sans rounded-lg hover:bg-gold-dark transition-colors"
              >
                <ExternalLink size={14} />
                Open in mail app
              </a>
            )}
          </div>
          {!tenant.email && (
            <p className="text-xs text-amber-600 font-sans">No email on file — add tenant email to enable mailto link.</p>
          )}
        </div>
      </div>
    </div>
  );
}
