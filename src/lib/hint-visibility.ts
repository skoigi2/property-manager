import type { HintType } from "@prisma/client";

/**
 * Which ActionableHint types a role may see. Hints carry figures in their
 * subtitle (LOW_PETTY_CASH literally embeds the float balance), so this is a
 * data-visibility rule, not a UI preference. Applied in GET /api/hints and
 * buildInbox() — hiding a nav item is not sufficient.
 *
 * CARETAKER: maintenance-only. Petty-cash balances are hidden from the role
 * everywhere else, so the low-float signal is suppressed too (a figure-free
 * caretaker variant is the alternative if the office wants them warned).
 */
const CARETAKER_HINT_TYPES: readonly HintType[] = ["URGENT_OPEN_4H", "SLA_BREACH"];

export function hintTypesVisibleTo(orgRole: string | null | undefined): readonly HintType[] | "ALL" {
  if (orgRole === "CARETAKER") return CARETAKER_HINT_TYPES;
  return "ALL";
}

/** Prisma `where` fragment for the visible hint types (empty object = no filter). */
export function hintTypeFilter(orgRole: string | null | undefined): { hintType?: { in: HintType[] } } {
  const visible = hintTypesVisibleTo(orgRole);
  return visible === "ALL" ? {} : { hintType: { in: [...visible] } };
}
