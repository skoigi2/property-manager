// GENERATED as part of the Float->Decimal money migration (see
// docs/decimal-migration-plan.md). Maps every money Decimal field back to
// `number` at the client-type level so existing code keeps plain-number
// ergonomics. Runtime conversion also happens in the query-level extension in
// prisma.ts (covers aggregates/groupBy); Number() here is safe on both Decimal
// and already-converted number values.
import { Prisma } from "@prisma/client";

export const decimalToNumberResultExtension = Prisma.defineExtension({
  result: {
    property: {
      managementFeeFlat: { needs: { managementFeeFlat: true }, compute: (r) => (r.managementFeeFlat === null ? null : Number(r.managementFeeFlat)) },
      serviceChargeDefault: { needs: { serviceChargeDefault: true }, compute: (r) => (r.serviceChargeDefault === null ? null : Number(r.serviceChargeDefault)) },
    },
    unit: {
      monthlyRent: { needs: { monthlyRent: true }, compute: (r) => (r.monthlyRent === null ? null : Number(r.monthlyRent)) },
    },
    tenant: {
      depositAmount: { needs: { depositAmount: true }, compute: (r) => Number(r.depositAmount) },
      monthlyRent: { needs: { monthlyRent: true }, compute: (r) => Number(r.monthlyRent) },
      serviceCharge: { needs: { serviceCharge: true }, compute: (r) => Number(r.serviceCharge) },
      proposedRent: { needs: { proposedRent: true }, compute: (r) => (r.proposedRent === null ? null : Number(r.proposedRent)) },
      parkingFee: { needs: { parkingFee: true }, compute: (r) => (r.parkingFee === null ? null : Number(r.parkingFee)) },
    },
    rentHistory: {
      monthlyRent: { needs: { monthlyRent: true }, compute: (r) => Number(r.monthlyRent) },
    },
    incomeEntry: {
      grossAmount: { needs: { grossAmount: true }, compute: (r) => Number(r.grossAmount) },
      agentCommission: { needs: { agentCommission: true }, compute: (r) => Number(r.agentCommission) },
      nightlyRate: { needs: { nightlyRate: true }, compute: (r) => (r.nightlyRate === null ? null : Number(r.nightlyRate)) },
      taxAmount: { needs: { taxAmount: true }, compute: (r) => (r.taxAmount === null ? null : Number(r.taxAmount)) },
    },
    expenseEntry: {
      amount: { needs: { amount: true }, compute: (r) => Number(r.amount) },
      amountPaid: { needs: { amountPaid: true }, compute: (r) => Number(r.amountPaid) },
      vatAmount: { needs: { vatAmount: true }, compute: (r) => (r.vatAmount === null ? null : Number(r.vatAmount)) },
    },
    expenseLineItem: {
      amount: { needs: { amount: true }, compute: (r) => Number(r.amount) },
      taxAmount: { needs: { taxAmount: true }, compute: (r) => (r.taxAmount === null ? null : Number(r.taxAmount)) },
      amountPaid: { needs: { amountPaid: true }, compute: (r) => Number(r.amountPaid) },
    },
    expenseUnitAllocation: {
      shareAmount: { needs: { shareAmount: true }, compute: (r) => Number(r.shareAmount) },
    },
    pettyCash: {
      amount: { needs: { amount: true }, compute: (r) => Number(r.amount) },
    },
    managementFeeConfig: {
      flatAmount: { needs: { flatAmount: true }, compute: (r) => (r.flatAmount === null ? null : Number(r.flatAmount)) },
    },
    maintenanceJob: {
      cost: { needs: { cost: true }, compute: (r) => (r.cost === null ? null : Number(r.cost)) },
    },
    approvalRequest: {
      amount: { needs: { amount: true }, compute: (r) => (r.amount === null ? null : Number(r.amount)) },
    },
    invoice: {
      rentAmount: { needs: { rentAmount: true }, compute: (r) => Number(r.rentAmount) },
      serviceCharge: { needs: { serviceCharge: true }, compute: (r) => Number(r.serviceCharge) },
      otherCharges: { needs: { otherCharges: true }, compute: (r) => Number(r.otherCharges) },
      lateFeeAmount: { needs: { lateFeeAmount: true }, compute: (r) => Number(r.lateFeeAmount) },
      totalAmount: { needs: { totalAmount: true }, compute: (r) => Number(r.totalAmount) },
      paidAmount: { needs: { paidAmount: true }, compute: (r) => (r.paidAmount === null ? null : Number(r.paidAmount)) },
    },
    ownerInvoice: {
      totalAmount: { needs: { totalAmount: true }, compute: (r) => Number(r.totalAmount) },
      paidAmount: { needs: { paidAmount: true }, compute: (r) => (r.paidAmount === null ? null : Number(r.paidAmount)) },
    },
    arrearsCase: {
      amountOwed: { needs: { amountOwed: true }, compute: (r) => Number(r.amountOwed) },
    },
    recurringExpense: {
      amount: { needs: { amount: true }, compute: (r) => Number(r.amount) },
    },
    depositSettlement: {
      depositHeld: { needs: { depositHeld: true }, compute: (r) => Number(r.depositHeld) },
      totalDeductions: { needs: { totalDeductions: true }, compute: (r) => Number(r.totalDeductions) },
      netRefunded: { needs: { netRefunded: true }, compute: (r) => Number(r.netRefunded) },
    },
    insurancePolicy: {
      premiumAmount: { needs: { premiumAmount: true }, compute: (r) => (r.premiumAmount === null ? null : Number(r.premiumAmount)) },
      coverageAmount: { needs: { coverageAmount: true }, compute: (r) => (r.coverageAmount === null ? null : Number(r.coverageAmount)) },
    },
    asset: {
      purchaseCost: { needs: { purchaseCost: true }, compute: (r) => (r.purchaseCost === null ? null : Number(r.purchaseCost)) },
    },
    assetMaintenanceSchedule: {
      estimatedCost: { needs: { estimatedCost: true }, compute: (r) => (r.estimatedCost === null ? null : Number(r.estimatedCost)) },
    },
    assetMaintenanceLog: {
      cost: { needs: { cost: true }, compute: (r) => (r.cost === null ? null : Number(r.cost)) },
    },
    managementAgreement: {
      leaseRenewalFeeFlat: { needs: { leaseRenewalFeeFlat: true }, compute: (r) => Number(r.leaseRenewalFeeFlat) },
      repairAuthorityLimit: { needs: { repairAuthorityLimit: true }, compute: (r) => Number(r.repairAuthorityLimit) },
      setupFeeTotal: { needs: { setupFeeTotal: true }, compute: (r) => (r.setupFeeTotal === null ? null : Number(r.setupFeeTotal)) },
    },
    checkoutProcess: {
      inventoryDamageAmount: { needs: { inventoryDamageAmount: true }, compute: (r) => Number(r.inventoryDamageAmount) },
      rentBalanceOwing: { needs: { rentBalanceOwing: true }, compute: (r) => Number(r.rentBalanceOwing) },
      originalDeposit: { needs: { originalDeposit: true }, compute: (r) => Number(r.originalDeposit) },
      totalDeductions: { needs: { totalDeductions: true }, compute: (r) => Number(r.totalDeductions) },
      balanceToRefund: { needs: { balanceToRefund: true }, compute: (r) => Number(r.balanceToRefund) },
    },
    checkoutDeduction: {
      amount: { needs: { amount: true }, compute: (r) => Number(r.amount) },
    },
  },
});
