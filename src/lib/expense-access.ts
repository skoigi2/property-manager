import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireOpsStaffWrite, requirePropertyAccess, isSuperAdminSession } from "@/lib/auth-utils";
import {
  decideExpenseMutation,
  orgMismatch,
  type ExpenseMutation,
  type PettyCashRowStatus,
} from "@/lib/expense-rules";

export { decideExpenseMutation, orgMismatch } from "@/lib/expense-rules";
export type { ExpenseMutation, ExpenseMutationDecision, PettyCashRowStatus } from "@/lib/expense-rules";

/**
 * Single choke point for every route that mutates an ExpenseEntry by id
 * (PUT, DELETE, receipt upload/delete). Centralises existence, property
 * access / org scoping, the ACCOUNTANT delete denial, and the CARETAKER
 * "own rows only" + "locked once the float holder confirmed" rules, so no
 * route can forget one of them. The pure rules live in expense-rules.ts.
 */

export interface ExpenseAccessRow {
  id: string;
  propertyId: string | null;
  organizationId: string | null;
  createdByUserId: string | null;
  paidFromPettyCash: boolean;
  pettyCashEntryId: string | null;
  pettyCashStatus: PettyCashRowStatus;
}

export async function loadExpenseAccessRow(id: string): Promise<ExpenseAccessRow | null> {
  const e = await prisma.expenseEntry.findUnique({
    where: { id },
    select: {
      id: true,
      propertyId: true,
      organizationId: true,
      createdByUserId: true,
      paidFromPettyCash: true,
      unit: { select: { propertyId: true } },
      pettyCashEntry: { select: { id: true, status: true } },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    propertyId: e.propertyId ?? e.unit?.propertyId ?? null,
    organizationId: e.organizationId,
    createdByUserId: e.createdByUserId,
    paidFromPettyCash: e.paidFromPettyCash,
    pettyCashEntryId: e.pettyCashEntry?.id ?? null,
    pettyCashStatus: (e.pettyCashEntry?.status as PettyCashRowStatus) ?? null,
  };
}

/**
 * Auth (ops staff + subscription write-gate) → row lookup → property access
 * or org scoping → role/ownership decision. Returns the session and the row
 * on success, or the Response to return.
 */
export async function requireExpenseMutation(
  id: string,
  action: ExpenseMutation,
): Promise<
  | { session: Session; row: ExpenseAccessRow; error: null }
  | { session: null; row: null; error: Response }
> {
  const { session, error } = await requireOpsStaffWrite();
  if (error || !session) return { session: null, row: null, error: error! };

  const row = await loadExpenseAccessRow(id);
  if (!row) return { session: null, row: null, error: Response.json({ error: "Not found" }, { status: 404 }) };

  if (row.propertyId) {
    const access = await requirePropertyAccess(row.propertyId);
    if (!access.ok) return { session: null, row: null, error: access.error! };
  } else if (orgMismatch(row.organizationId, session.user.organizationId)) {
    return { session: null, row: null, error: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  const decision = decideExpenseMutation({
    orgRole: session.user.orgRole,
    isSuperAdmin: isSuperAdminSession(session),
    userId: session.user.id,
    row,
    action,
  });
  if (!decision.ok) {
    return {
      session: null,
      row: null,
      error: Response.json({ error: decision.error, ...(decision.code ? { code: decision.code } : {}) }, { status: decision.status }),
    };
  }

  return { session, row, error: null };
}
