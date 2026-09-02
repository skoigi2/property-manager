import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds } from "@/lib/auth-utils";
import { distinctPropertyIds, type ExpenseTargets } from "@/lib/expense-scope";

export type CheckedExpenseTargets =
  | (ExpenseTargets & {
      ok: true;
      /** The single property this expense lives under (the unit's property
       *  for UNIT scope, the picked property for PROPERTY, undefined for
       *  PORTFOLIO). Drives tax-rule lookup and petty-cash scoping. */
      effectivePropertyId: string | undefined;
    })
  | { ok: false; status: number; error: string };

/**
 * Server-side half of scope resolution: verifies the units exist, refuses a
 * split across two properties (the ledger would silently attribute the whole
 * cost to whichever unit came first), and checks the caller may touch the
 * property. Returns a JSON-ready error the form can show verbatim.
 */
export async function checkExpenseTargets(t: ExpenseTargets): Promise<CheckedExpenseTargets> {
  const accessible = await getAccessiblePropertyIds();
  if (!accessible) return { ok: false, status: 401, error: "Unauthorized" };

  let effectivePropertyId = t.propertyId;
  if (t.unitIds.length > 0) {
    const units = await prisma.unit.findMany({
      where: { id: { in: t.unitIds } },
      select: { id: true, propertyId: true },
    });
    if (units.length !== t.unitIds.length) {
      return { ok: false, status: 400, error: "One of the selected units no longer exists. Reload and try again" };
    }
    const props = distinctPropertyIds(units);
    if (props.length > 1) {
      return { ok: false, status: 400, error: "All units in a split must belong to the same property" };
    }
    effectivePropertyId = props[0];
  }
  if (effectivePropertyId && !accessible.includes(effectivePropertyId)) {
    return { ok: false, status: 403, error: "You do not have access to that property" };
  }
  return { ok: true, ...t, effectivePropertyId };
}
