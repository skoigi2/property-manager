import { roleCan, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";

/**
 * Pure rules for mutating an ExpenseEntry by id (no prisma / next-auth
 * imports — unit-tested in expense-access.test.ts). The request-bound
 * wrapper lives in src/lib/expense-access.ts.
 */

export type ExpenseMutation = "edit" | "delete" | "attach";
export type PettyCashRowStatus = "PENDING" | "APPROVED" | "REJECTED" | null;

export type ExpenseMutationDecision =
  | { ok: true }
  | { ok: false; status: 403 | 409; error: string; code?: string };

/**
 * Order matters: the FINANCIAL_DELETE check runs first so an ACCOUNTANT keeps
 * today's exact 403 body, then the own-row rule, then the confirmed-withdrawal
 * lock.
 */
export function decideExpenseMutation(input: {
  orgRole: string | null | undefined;
  isSuperAdmin: boolean;
  userId: string;
  row: { createdByUserId: string | null; pettyCashStatus: PettyCashRowStatus };
  action: ExpenseMutation;
}): ExpenseMutationDecision {
  const { orgRole, isSuperAdmin, userId, row, action } = input;
  if (isSuperAdmin) return { ok: true };

  if (action === "delete" && !roleCan(orgRole, "FINANCIAL_DELETE")) {
    return { ok: false, status: 403, error: PERMISSION_DENIED_MESSAGE.FINANCIAL_DELETE, code: "PERMISSION_DENIED" };
  }

  if (!roleCan(orgRole, "EXPENSE_EDIT_OTHERS")) {
    // NULL creator (legacy row, importer, cron) is nobody's row — fail closed.
    if (!row.createdByUserId || row.createdByUserId !== userId) {
      return { ok: false, status: 403, error: PERMISSION_DENIED_MESSAGE.EXPENSE_EDIT_OTHERS, code: "PERMISSION_DENIED" };
    }
    // Once the float holder has APPROVED the linked petty-cash OUT row, the
    // cash has left the tin on their say-so: amount / date / delete would move
    // the balance without them. PENDING and REJECTED rows stay editable so
    // the caretaker can fix or resubmit.
    if ((action === "edit" || action === "delete") && row.pettyCashStatus === "APPROVED") {
      return {
        ok: false,
        status: 409,
        error: "This petty-cash withdrawal has been confirmed by the float holder — ask a manager to adjust it.",
        code: "PETTY_CASH_CONFIRMED",
      };
    }
  }

  return { ok: true };
}

/** Portfolio rows: another org's expense must look like it doesn't exist. */
export function orgMismatch(rowOrgId: string | null, sessionOrgId: string | null | undefined): boolean {
  return !!rowOrgId && !!sessionOrgId && rowOrgId !== sessionOrgId;
}
