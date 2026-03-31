"use client";
import { useState } from "react";
import { X, Copy, Check, Mail, ExternalLink } from "lucide-react";
import { formatKSh } from "@/lib/currency";

interface StatementLine {
  tenantName:   string;
  unit:         string;
  rentExpected: number;
  rentReceived: number;
  grossTotal:   number;
}

interface Props {
  statement: {
    propertyName:  string;
    propertyType:  string;
    period:        string;
    lines:         StatementLine[];
    grossIncome:   number;
    managementFee: number;
    expenses:      { category: string; description: string; amount: number }[];
    totalExpenses: number;
    netPayable:    number;
    ownerName:     string | null;
    ownerEmail:    string | null;
  };
  onClose: () => void;
}

function buildDraft(s: Props["statement"]): { subject: string; body: string } {
  const firstName = s.ownerName ? s.ownerName.split(" ")[0] : "Property Owner";
  const subject = `Owner Statement — ${s.propertyName} · ${s.period}`;

  const isAirbnb = s.propertyType === "AIRBNB";

  // Income lines block
  let incomeBlock: string;
  if (isAirbnb) {
    const unitLines = s.lines
      .map(l => `  • ${l.tenantName}:  ${formatKSh(l.grossTotal)}`)
      .join("\n");
    incomeBlock = `Short-Let Revenue — ${s.lines.length} unit(s) recorded:\n${unitLines}`;
  } else {
    const paidCount = s.lines.filter(l => l.rentReceived >= l.rentExpected * 0.99).length;
    const tenantLines = s.lines
      .map(l => `  • ${l.tenantName} (Unit ${l.unit}):  ${formatKSh(l.rentReceived)}`)
      .join("\n");
    incomeBlock = `Rent Collections — ${paidCount} of ${s.lines.length} tenant${s.lines.length !== 1 ? "s" : ""} paid:\n${tenantLines}`;
  }

  // Expenses block
  let expensesBlock = `  Less: Management Fee:         (${formatKSh(s.managementFee)})`;
  if (s.expenses.length > 0) {
    expensesBlock += `\n  Less: Operating Expenses:\n`;
    expensesBlock += s.expenses
      .map(e => `    - ${e.description}:  (${formatKSh(e.amount)})`)
      .join("\n");
  }

  const divider = "────────────────────────────────────────";

  const body = `Dear ${firstName},

Please find below your monthly owner statement for ${s.propertyName} covering ${s.period}.

${divider}
INCOME SUMMARY
${divider}

${incomeBlock}

Gross Income:  ${formatKSh(s.grossIncome)}

${divider}
DEDUCTIONS
${divider}

${expensesBlock}

${divider}
NET PAYABLE TO OWNER:  ${formatKSh(s.netPayable)}
${divider}

Please confirm receipt of this statement. If the above amount has not yet been transferred, kindly advise your preferred remittance timeline.

Should you have any queries regarding the figures above, please do not hesitate to reach out.

Kind regards,
Property Management`;

  return { subject, body };
}

export function OwnerEmailDraftModal({ statement, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const draft = buildDraft(statement);

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  const mailtoLink = statement.ownerEmail
    ? `mailto:${statement.ownerEmail}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-gold" />
            <h2 className="font-display text-base text-header">Email Owner</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* To */}
          <div>
            <p className="text-xs font-sans text-gray-400 uppercase tracking-wide mb-1">To</p>
            {statement.ownerEmail ? (
              <p className="text-sm font-sans text-header">{statement.ownerEmail}</p>
            ) : (
              <p className="text-xs font-sans text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No email on file for this owner. Add the owner&apos;s email in Settings to enable the mailto link.
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <p className="text-xs font-sans text-gray-400 uppercase tracking-wide mb-1">Subject</p>
            <p className="text-sm font-sans text-header">{draft.subject}</p>
          </div>

          {/* Body */}
          <div>
            <p className="text-xs font-sans text-gray-400 uppercase tracking-wide mb-1">Body</p>
            <pre className="text-xs font-mono text-gray-700 bg-cream rounded-xl p-4 whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {draft.body}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={copyBody}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-sans font-medium bg-gold text-white rounded-xl hover:bg-gold-dark transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy body"}
          </button>
          {mailtoLink && (
            <a
              href={mailtoLink}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-sans font-medium border border-gray-200 rounded-xl text-gray-600 hover:border-gold/40 hover:text-gold transition-colors"
            >
              <ExternalLink size={14} /> Open in mail app
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
