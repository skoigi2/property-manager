// The rent increase notice — one wording shared by the PDF letter and the
// email, so the tenant's copy and the attachment can't disagree. Pure: the
// caller formats money and dates (property currency, en-GB dates).

export interface RentIncreaseNoticeContext {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  /** Who signs: the organisation, else the property. */
  senderName: string;
  /** Pre-formatted. */
  today: string;
  currentRent: string;
  newRent: string;
  /** e.g. "+ KSh 2,000 (5.0%)". */
  change: string;
  effectiveDate: string;
  /** e.g. "5% every year" — omitted when the lease has no recorded terms. */
  leaseTerms: string | null;
  /** Days of notice this letter gives. */
  noticeDays: number;
  serviceChargeNote: string | null;
}

export interface RentIncreaseNotice {
  title: string;
  subject: string;
  paragraphs: string[];
  signOff: string[];
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

export function buildRentIncreaseNotice(ctx: RentIncreaseNoticeContext): RentIncreaseNotice {
  const basis = ctx.leaseTerms
    ? `In accordance with the rent review clause of your tenancy agreement (${ctx.leaseTerms}), `
    : "In accordance with your tenancy agreement, ";
  return {
    title: "NOTICE OF RENT INCREASE",
    subject: `Notice of rent increase — Unit ${ctx.unitNumber}, ${ctx.propertyName}`,
    paragraphs: [
      `Dear ${firstName(ctx.tenantName)},`,
      `${basis}we write to give you notice that the monthly rent for Unit ${ctx.unitNumber}, ${ctx.propertyName} will change as follows:`,
      `Current monthly rent: ${ctx.currentRent}\nNew monthly rent: ${ctx.newRent} (${ctx.change})\nEffective from: ${ctx.effectiveDate}`,
      `This notice gives you ${ctx.noticeDays} days before the new rent takes effect. Invoices from ${ctx.effectiveDate} onwards will show the new amount.` +
        (ctx.serviceChargeNote ? ` ${ctx.serviceChargeNote}` : ""),
      "All other terms of your tenancy remain unchanged. If you have any questions about this notice, please contact us.",
    ],
    signOff: ["Yours faithfully,", "Property Manager", ctx.senderName],
  };
}
