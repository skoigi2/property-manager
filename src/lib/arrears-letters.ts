/**
 * Arrears correspondence templates, keyed on ARREARS_V1 workflow stage key.
 *
 * A registry rather than a switch, because stage keys are namespaced by
 * `workflowKey` and therefore stable, whereas the old code keyed off the legacy
 * `ArrearsStage` enum that no longer exists.
 *
 * The value is an ARRAY on purpose — a stage can own more than one document,
 * and forcing 1:1 is what stranded the eviction template in the first place.
 *
 * Each stage produces a *distinct* artefact. That matters legally as much as
 * procedurally: a formal notice states the balance and a date to pay by; a
 * demand letter states consequences and is the pre-action document you must be
 * able to produce if this reaches a tribunal. Collapsing them means either the
 * formal notice arrives with demand-letter teeth (far too fast for a tenant ten
 * days late) or the demand letter arrives toothless — and it burns the
 * escalation, because a tenant who has already had that letter reads the second
 * one as noise.
 *
 * Send these through EmailDraftModal with `caseThreadId` set, so each one
 * dual-writes an EMAIL_SENT CaseEvent. The resulting timeline — formal notice
 * sent 3 Feb, demand letter sent 21 Feb — is the actual asset, and it only
 * works if the events are distinguishable.
 */

export interface LetterContext {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  /** Pre-formatted with the property's currency. */
  amount: string;
  /** Pre-formatted date. */
  today: string;
}

export interface LetterTemplate {
  /** Stable id, unique across the registry. */
  key: string;
  title: string;
  /** What this document does, and when it's the right one to send. */
  purpose: string;
  subject: (ctx: LetterContext) => string;
  body: (ctx: LetterContext) => string;
}

const firstName = (full: string) => full.split(" ")[0];

const signOff = (ctx: LetterContext) =>
  `Yours faithfully,\nProperty Manager\n${ctx.propertyName}`;

const addressBlock = (ctx: LetterContext) =>
  `Date: ${ctx.today}\n\nTo: ${ctx.tenantName}\nUnit ${ctx.unitNumber}, ${ctx.propertyName}`;

export const ARREARS_LETTERS: Record<string, LetterTemplate[]> = {
  // Stage 1 — states the balance and a date. No consequences language: this is
  // the document for a tenant who is days late and has probably just forgotten.
  formal_notice: [
    {
      key: "formal_notice",
      title: "Formal Notice",
      purpose:
        "States the balance and a date to pay by. No threat of action — send this before the demand letter.",
      subject: (ctx) => `Rent arrears notice — Unit ${ctx.unitNumber}, ${ctx.propertyName}`,
      body: (ctx) =>
        `NOTICE OF RENT ARREARS\n\n${addressBlock(ctx)}\n\n` +
        `Dear ${firstName(ctx.tenantName)},\n\n` +
        `Our records show that the rent account for Unit ${ctx.unitNumber} is currently in arrears of ${ctx.amount}.\n\n` +
        `We would be grateful if you could settle this balance within FOURTEEN (14) days of the date of this notice.\n\n` +
        `If payment has already been sent, please disregard this notice and let us know the date and method so we can trace it. ` +
        `If you are having difficulty paying, please contact us — we would rather agree a payment arrangement with you than let the balance grow.\n\n` +
        `${signOff(ctx)}`,
    },
  ],

  // Stage 2 — the pre-action document. States consequences.
  demand_letter: [
    {
      key: "demand_letter",
      title: "Demand Letter",
      purpose:
        "Formal demand requiring payment within 7 days, stating that legal action follows. The pre-action document.",
      subject: (ctx) => `Formal demand for rent payment — Unit ${ctx.unitNumber}`,
      body: (ctx) =>
        `DEMAND FOR RENT PAYMENT\n\n${addressBlock(ctx)}\n\n` +
        `Dear ${firstName(ctx.tenantName)},\n\n` +
        `Despite our previous notice, we note that your rent account is in arrears of ${ctx.amount}.\n\n` +
        `You are hereby formally demanded to settle the outstanding balance in full within SEVEN (7) days of the date of this letter.\n\n` +
        `Failure to comply will compel us to take legal action to recover the debt, including costs.\n\n` +
        `${signOff(ctx)}`,
    },
  ],

  // Stage 3 — proceedings begin.
  legal_action: [
    {
      key: "notice_to_remedy",
      title: "Notice to Remedy Breach",
      purpose:
        "Puts the tenant on notice that the tenancy is in breach and proceedings will commence if unremedied.",
      subject: (ctx) => `Legal notice — breach of tenancy, Unit ${ctx.unitNumber}`,
      body: (ctx) =>
        `NOTICE TO REMEDY BREACH\n\n${addressBlock(ctx)}\n\n` +
        `Dear ${firstName(ctx.tenantName)},\n\n` +
        `You are hereby given LEGAL NOTICE that your tenancy is in breach due to outstanding rent arrears of ${ctx.amount}.\n\n` +
        `Under the terms of your lease agreement, you are required to remedy this breach within FOURTEEN (14) days.\n\n` +
        `If the arrears are not cleared within this period, legal proceedings will be commenced without further notice.\n\n` +
        `${signOff(ctx)}`,
    },
  ],

  // Stage 4 — possession. Note this does not extinguish the debt.
  eviction: [
    {
      key: "notice_to_vacate",
      title: "Notice to Vacate",
      purpose:
        "Requires the tenant to surrender possession. Does not extinguish the outstanding debt.",
      subject: (ctx) => `Notice to vacate — Unit ${ctx.unitNumber}, ${ctx.propertyName}`,
      body: (ctx) =>
        `NOTICE TO VACATE\n\n${addressBlock(ctx)}\n\n` +
        `Dear ${firstName(ctx.tenantName)},\n\n` +
        `You are hereby given formal notice to VACATE the above premises.\n\n` +
        `As of this date, your rent arrears stand at ${ctx.amount} and previous notices have not resulted in payment.\n\n` +
        `You are required to vacate the premises and surrender vacant possession within THIRTY (30) days of this notice.\n\n` +
        `This notice does not extinguish the outstanding debt owed.\n\n` +
        `${signOff(ctx)}`,
    },
  ],
};

/** Letters available at a given workflow stage. Empty for stages with none. */
export function getArrearsLetters(stageKey: string): LetterTemplate[] {
  return ARREARS_LETTERS[stageKey] ?? [];
}

/** Every letter in the registry, for a "pick any document" affordance. */
export function allArrearsLetters(): LetterTemplate[] {
  return Object.values(ARREARS_LETTERS).flat();
}
