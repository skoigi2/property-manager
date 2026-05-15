"use client";
import { useState } from "react";
import { X, Copy, Check, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

type Template = "quote_request" | "schedule_visit" | "approval_to_proceed" | "job_complete" | "payment_notification";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
}

interface CaseContext {
  id: string;
  title: string;
  propertyName: string;
  unitNumber: string | null;
  jobDescription?: string | null;
}

interface Props {
  vendor: Vendor;
  caseContext: CaseContext;
  /** Carries email into the case timeline via the API-side dual-write. */
  caseThreadId: string;
  initialTemplate?: Template;
  onClose: () => void;
}

const TEMPLATES: { value: Template; label: string }[] = [
  { value: "quote_request",       label: "Quote request" },
  { value: "schedule_visit",      label: "Schedule visit" },
  { value: "approval_to_proceed", label: "Approval to proceed" },
  { value: "job_complete",        label: "Job complete confirmation" },
  { value: "payment_notification",label: "Payment notification" },
];

function buildDraft(template: Template, vendor: Vendor, ctx: CaseContext): { subject: string; body: string } {
  const firstName = vendor.name.split(" ")[0];
  const location = `${ctx.propertyName}${ctx.unitNumber ? ` · Unit ${ctx.unitNumber}` : ""}`;
  const prefix = `[${ctx.title}]`;
  const desc = ctx.jobDescription ? `\n\nDescription:\n${ctx.jobDescription}` : "";

  switch (template) {
    case "quote_request":
      return {
        subject: `${prefix} Quote request`,
        body: `Hi ${firstName},

We have a job that needs your attention at ${location}.${desc}

Could you please provide a written quote with the following breakdown:
  • Labour
  • Materials
  • Estimated lead time

Please let us know if you need any further information or a site visit before quoting.

Thank you,
Property Management`,
      };
    case "schedule_visit":
      return {
        subject: `${prefix} Schedule visit`,
        body: `Hi ${firstName},

We'd like to schedule your visit to ${location}.${desc}

Could you confirm availability on any of the following slots?
  1. ___
  2. ___
  3. ___

Please reply with your preferred slot or suggest alternatives.

Thank you,
Property Management`,
      };
    case "approval_to_proceed":
      return {
        subject: `${prefix} Approval to proceed`,
        body: `Hi ${firstName},

Your quote has been approved. Please proceed with the works at ${location}.${desc}

Please share the proposed start date and keep us posted on progress.

Thank you,
Property Management`,
      };
    case "job_complete":
      return {
        subject: `${prefix} Job complete — confirmation requested`,
        body: `Hi ${firstName},

Please confirm in writing that the works at ${location} are now complete.${desc}

Include:
  • Date completed
  • Final invoice (with breakdown)
  • Warranty period, if applicable

Thank you,
Property Management`,
      };
    case "payment_notification":
      return {
        subject: `${prefix} Payment notification`,
        body: `Hi ${firstName},

This is to confirm that payment for the works at ${location} has been processed.${desc}

Please send a receipt for our records.

Thank you,
Property Management`,
      };
  }
}

export function VendorEmailModal({ vendor, caseContext, caseThreadId, initialTemplate, onClose }: Props) {
  const [template, setTemplate] = useState<Template>(initialTemplate ?? "quote_request");
  const [copied, setCopied] = useState(false);
  const draft = buildDraft(template, vendor, caseContext);

  function autoLog() {
    // Vendor emails write a CaseEvent directly (no CommunicationLog — that table is tenant-only)
    fetch(`/api/cases/${caseThreadId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "COMMENT",
        body: `📧 Email to ${vendor.name} <${vendor.email ?? "no email"}>\n\nSubject: ${draft.subject}\n\n${draft.body.slice(0, 500)}`,
      }),
    })
      .then(() => toast.success("Logged to case timeline"))
      .catch(() => {});
  }

  async function copyBody() {
    await navigator.clipboard.writeText(draft.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    autoLog();
  }

  const mailtoLink = vendor.email
    ? `mailto:${vendor.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg">Email vendor — {vendor.name}</h2>
            <p className="text-xs text-gray-500 font-sans">{vendor.email ?? "No email on file"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as Template)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans"
            >
              {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">Subject</label>
            <input
              readOnly
              value={draft.subject}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">Body</label>
            <textarea
              readOnly
              rows={14}
              value={draft.body}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans bg-gray-50 resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 justify-end">
          <button onClick={copyBody} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-sans hover:bg-gray-50">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy body"}
          </button>
          {mailtoLink && (
            <a
              href={mailtoLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={autoLog}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-sans hover:bg-gold-dark"
            >
              <ExternalLink size={14} />
              Open in mail app
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
