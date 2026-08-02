import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { waterfallLineItemPayments } from "@/lib/vendor-payments";

/** Any Prisma op runnable inside an array-form $transaction. */
export type TxOp = Prisma.PrismaPromise<unknown>;

// Server-side glue for the allocation ↔ expense reconciliation rule (see
// vendor-payments.ts): whenever a payment's allocations change, every touched
// expense gets amountPaid = SUM(all its allocations) — and, when the expense
// carries line items, the same total waterfalled across them (because
// calcExpensePayment derives paid from line items when they exist). All ops
// are returned as Prisma promises so callers can run them in ONE array-form
// prisma.$transaction([...]) (callback form is pgBouncer-incompatible).

export interface RecomputeExpense {
  id: string;
  lineItems: { id: string; amount: number }[];
}

/**
 * Builds the update ops that stamp `paidTotal` onto an expense (allocation-sum
 * as source of truth — this intentionally overwrites any manual amountPaid so
 * the two are never double-counted).
 */
export function buildExpensePaidOps(
  expense: RecomputeExpense,
  paidTotal: number
): TxOp[] {
  const ops: TxOp[] = [
    prisma.expenseEntry.update({
      where: { id: expense.id },
      data: { amountPaid: paidTotal },
    }),
  ];
  if (expense.lineItems.length > 0) {
    for (const li of waterfallLineItemPayments(expense.lineItems, paidTotal)) {
      ops.push(
        prisma.expenseLineItem.update({
          where: { id: li.id },
          data: { amountPaid: li.amountPaid, paymentStatus: li.paymentStatus },
        })
      );
    }
  }
  return ops;
}

/**
 * Sums existing allocations per expense, optionally excluding one payment
 * (used when that payment's allocations are being replaced or deleted in the
 * same transaction).
 */
export async function getAllocationSums(
  expenseEntryIds: string[],
  excludePaymentId?: string
): Promise<Map<string, number>> {
  if (expenseEntryIds.length === 0) return new Map();
  const grouped = await prisma.vendorPaymentAllocation.groupBy({
    by: ["expenseEntryId"],
    where: {
      expenseEntryId: { in: expenseEntryIds },
      ...(excludePaymentId ? { vendorPaymentId: { not: excludePaymentId } } : {}),
    },
    _sum: { amount: true },
  });
  return new Map(grouped.map((g) => [g.expenseEntryId, Number(g._sum.amount ?? 0)]));
}
