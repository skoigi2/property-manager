/**
 * Approval status for a petty-cash OUT row. Pure — shared by POST
 * /api/petty-cash and the expense routes' linked OUT-row create/update.
 *
 * - CARETAKER rows are always PENDING: on-site staff write to a float they
 *   cannot see, so the float holder confirms before the balance moves (only
 *   APPROVED rows count — see calcPettyCashBalance).
 * - Everyone else: PENDING above the property's repair authority limit
 *   (`ManagementAgreement.repairAuthorityLimit`), else APPROVED. The expense
 *   path applies the same threshold as the Petty Cash page — it used to skip
 *   it, so a large "paid from petty cash" expense was auto-approved.
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

export type PettyCashRowStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * When a linked OUT row is edited in place from the expense form: decide the
 * status update, if any. Mirrors PATCH /api/petty-cash/[id]'s re-evaluation
 * but only when the amount actually changed — a description tweak must not
 * un-approve a row. Returns the Prisma `data` fragment or null (no change).
 *
 * - CARETAKER edits always resubmit (PENDING) — they can only reach a row
 *   that is PENDING or REJECTED.
 * - Amount changed and the new figure crosses the limit → PENDING with the
 *   approval fields cleared; drops back under the limit while PENDING → APPROVED.
 * - A REJECTED row is left alone for non-caretakers (the float holder said no;
 *   editing the expense is not a resubmission unless a caretaker does it).
 */
export function reevaluatePettyCashOutStatus(input: {
  orgRole: string | null | undefined;
  currentStatus: PettyCashRowStatus;
  amountChanged: boolean;
  amount: number;
  repairAuthorityLimit: number | null | undefined;
}): { status: PettyCashRowStatus; clearApproval: boolean } | null {
  const cleared = { status: "PENDING" as const, clearApproval: true };
  if (input.orgRole === "CARETAKER") return cleared;
  if (!input.amountChanged || input.currentStatus === "REJECTED") return null;
  const next = resolvePettyCashOutStatus(input);
  if (next === "PENDING" && input.currentStatus !== "PENDING") return cleared;
  if (next === "APPROVED" && input.currentStatus === "PENDING") return { status: "APPROVED", clearApproval: false };
  return null;
}
