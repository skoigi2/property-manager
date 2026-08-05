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
      lineItems: { select: { quantity: true, unitRate: true, unit: true, unitOther: true, discountAmount: true, amountPaid: true } },
    },
    orderBy: { date: "desc" },
  });

  const rows = expenses.map((e) => {
    // Single-line expenses round-trip their qty × rate breakdown (the shape
    // the importer itself creates); multi-line expenses export amount-only —
    // the import route refuses to clobber their lines anyway.
    const line = e.lineItems.length === 1 ? e.lineItems[0] : null;
    const paidEffective = e.lineItems.length > 0
      ? e.lineItems.reduce((s, li) => s + li.amountPaid, 0)
      : e.amountPaid;
    return {
      Date: ymd(e.date),
      Category: e.category as string,
      Amount: e.amount,
      Quantity: line?.quantity ?? "",
      Unit: line?.unit ? (line.unit === "OTHER" ? line.unitOther ?? "OTHER" : (line.unit as string)) : "",
      "Unit Rate": line?.unitRate ?? "",
      Scope: e.scope as string,
      Description: e.description ?? "",
      "Property Name": e.property?.name ?? "",
      "Unit Number": e.unit?.unitNumber ?? "",
      "Sunk Cost": e.isSunkCost ? "Yes" : "No",
      "Petty Cash": e.paidFromPettyCash ? "Yes" : "No",
      "Vendor Name": e.vendor?.name ?? "",
      "Amount Paid": paidEffective,
      "Due Date": ymd(e.dueDate),
      "VAT Amount": e.vatAmount ?? "",
      Discount: (line ? line.discountAmount : e.discountAmount) ?? "",
      "Payment Method": (e.paymentMethod as string | null) ?? "",
      "Payment Reference": e.paymentReference ?? "",
      "Payment Date": ymd(e.paymentDate),
      Notes: e.notes ?? "",
      ID: e.id,
    };
  });

  return Response.json({ rows });
}
