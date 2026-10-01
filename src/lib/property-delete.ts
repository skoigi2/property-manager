import { prisma } from "@/lib/prisma";

/**
 * Deletes a property and its whole data tree, in FK-safe order — run as one
 * array-form transaction: `prisma.$transaction(deletePropertyOps(id))`.
 * Used by DELETE /api/properties/[id], the demo re-seed and scripts.
 *
 * TenantDocument / Invoice / DepositSettlement / CheckoutProcess /
 * CommunicationLog / PortalMessageThread cascade when Tenant is deleted.
 * ExpenseLineItem / ExpenseUnitAllocation / ExpenseDocument / PettyCash
 * (linked) cascade when ExpenseEntry is deleted; ConditionReportPhoto
 * cascades with ConditionReport. MaintenanceJob / OwnerInvoice / ArrearsCase /
 * InsurancePolicy / Asset / ManagementAgreement / BuildingConditionReport /
 * PropertyAccess / CaseThread / TaxConfiguration / ComplianceCertificate /
 * OwnerPayout all have onDelete: Cascade on the Property relation.
 *
 * FK-Restrict blockers that MUST be cleared before units / property go:
 *   - ConditionReport (required unit + property FKs, nothing cascades it)
 *   - ExpenseUnitAllocation (required unit FK — cleared via deleting the
 *     property-linked expenses BEFORE units, plus an explicit pass for
 *     allocations that belong to portfolio / other-scope expenses)
 */
export function deletePropertyOps(propertyId: string) {
  return [
    prisma.conditionReport.deleteMany({ where: { propertyId } }),
    prisma.expenseUnitAllocation.deleteMany({ where: { unit: { propertyId } } }),
    prisma.incomeEntry.deleteMany({ where: { unit: { propertyId } } }),
    prisma.managementFeeConfig.deleteMany({ where: { unit: { propertyId } } }),
    prisma.tenant.deleteMany({ where: { unit: { propertyId } } }),
    // Before units: also removes unit-scoped rows (propertyId null, unitId set),
    // which previously survived as orphaned property-less expenses.
    prisma.expenseEntry.deleteMany({
      where: { OR: [{ propertyId }, { unit: { propertyId } }] },
    }),
    // Unit-linked rows must go BEFORE units — the optional unit FKs SetNull on
    // unit deletion, so a later `unit: { propertyId }` filter matches nothing.
    prisma.recurringExpense.deleteMany({
      where: { OR: [{ propertyId }, { unit: { propertyId } }] },
    }),
    prisma.unit.deleteMany({ where: { propertyId } }),
    prisma.pettyCash.deleteMany({ where: { propertyId } }),
    prisma.property.delete({ where: { id: propertyId } }),
  ];
}
