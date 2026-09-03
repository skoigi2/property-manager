/**
 * Approval status for a petty-cash OUT row at creation time. Pure — shared
 * by POST /api/petty-cash and the expense routes' nested OUT-row create.
 *
 * - CARETAKER rows are always PENDING: on-site staff write to a float they
 *   cannot see, so the float holder confirms before the balance moves (only
 *   APPROVED rows count — see calcPettyCashBalance).
 * - Everyone else: PENDING only above the property's repair authority limit
 *   (the long-standing POST /api/petty-cash rule), else APPROVED. Callers that
 *   don't apply the threshold pass `repairAuthorityLimit: null`.
 */
export function resolvePettyCashOutStatus(input: {
  orgRole: string | null | undefined;
  amount: number;
  repairAuthorityLimit: number | null | undefined;
}): "APPROVED" | "PENDING" {
  if (input.orgRole === "CARETAKER") return "PENDING";
  if (input.repairAuthorityLimit != null && input.amount > input.repairAuthorityLimit) return "PENDING";
  return "APPROVED";
}
