import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/** YYYY-MM-DD or "" for a nullable date. */
function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Export every accessible expense pre-shaped into the import-template columns,
 * with the ID column populated. The client downloads this as an xlsx; editing
 * it and re-uploading with mode="upsert" updates each row by ID (see the
 * import route) instead of creating duplicates.
 *
 * Keys MUST match EXPENSE_COLS in src/app/(dashboard)/import/page.tsx.
 */
export async function GET() {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const expenses = await prisma.expenseEntry.findMany({
    where: { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const rows = expenses.map((e) => ({
    Date: ymd(e.date),
    Category: e.category as string,
    Amount: e.amount,
    Scope: e.scope as string,
    Description: e.description ?? "",
    "Property Name": e.property?.name ?? "",
    "Unit Number": e.unit?.unitNumber ?? "",
    "Sunk Cost": e.isSunkCost ? "Yes" : "No",
    "Petty Cash": e.paidFromPettyCash ? "Yes" : "No",
    "Vendor Name": e.vendor?.name ?? "",
    "Amount Paid": e.amountPaid,
    "Due Date": ymd(e.dueDate),
    "VAT Amount": e.vatAmount ?? "",
    "Payment Method": (e.paymentMethod as string | null) ?? "",
    "Payment Reference": e.paymentReference ?? "",
    "Payment Date": ymd(e.paymentDate),
    Notes: e.notes ?? "",
    ID: e.id,
  }));

  return Response.json({ rows });
}
