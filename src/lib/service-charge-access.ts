import "server-only";
import { requireManager, requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { loadBudgetRecord, type BudgetRecord } from "@/lib/service-charge-data";

type Session = NonNullable<Awaited<ReturnType<typeof requireManager>>["session"]>;

/**
 * Manager-tier gate for one service charge budget: auth (write = subscription
 * write-gate too), existence, and access to its property. Another org's
 * budget is a 404.
 */
export async function authorizeBudget(
  budgetId: string,
  opts: { write?: boolean } = {},
): Promise<{ error: Response; budget?: undefined; session?: undefined } | { error: null; budget: BudgetRecord; session: Session }> {
  const { error, session } = opts.write ? await requireManagerWrite() : await requireManager();
  if (error) return { error };
  const budget = await loadBudgetRecord(budgetId);
  if (!budget) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  const access = await requirePropertyAccess(budget.propertyId);
  if (!access.ok) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  return { error: null, budget, session: session! };
}
