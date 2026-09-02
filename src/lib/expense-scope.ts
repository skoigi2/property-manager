/**
 * Scope / target resolution for expenses (pure, no DB).
 *
 * The expense form keeps every field mounted-or-remembered, so a user who
 * picked a property under "Whole Property" and then switched to "Unit" still
 * submits that propertyId. The scope is the only thing the user consciously
 * chose, so it decides which target ids survive:
 *
 *   PORTFOLIO -> nothing (org-wide cost, no property, no unit)
 *   PROPERTY  -> propertyId only
 *   UNIT      -> unitIds only (deduped; a lone legacy unitId is promoted)
 */
export type ExpenseScope = "UNIT" | "PROPERTY" | "PORTFOLIO";

export interface ExpenseTargets {
  /** Set only when exactly one unit is targeted. */
  unitId: string | undefined;
  /** Every unit the cost is split across (empty unless scope = UNIT). */
  unitIds: string[];
  /** Set only for scope = PROPERTY. */
  propertyId: string | undefined;
}

export function resolveExpenseTargets(
  scope: ExpenseScope,
  input: { unitId?: string | null; unitIds?: string[] | null; propertyId?: string | null },
): ExpenseTargets {
  if (scope === "PORTFOLIO") return { unitId: undefined, unitIds: [], propertyId: undefined };
  if (scope === "PROPERTY") {
    return { unitId: undefined, unitIds: [], propertyId: input.propertyId || undefined };
  }
  const ids = Array.from(new Set((input.unitIds ?? []).filter((id): id is string => !!id)));
  if (ids.length === 0 && input.unitId) ids.push(input.unitId);
  return { unitId: ids.length === 1 ? ids[0] : undefined, unitIds: ids, propertyId: undefined };
}

/** Distinct property ids across a unit set; more than one means a cross-property split. */
export function distinctPropertyIds(units: { propertyId: string }[]): string[] {
  return Array.from(new Set(units.map((u) => u.propertyId)));
}
