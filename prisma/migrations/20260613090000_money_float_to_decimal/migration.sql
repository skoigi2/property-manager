-- Money columns: double precision -> numeric(14,2), rounding existing float drift to 2dp.
-- Rates/percentages/dimensions deliberately stay double precision.

ALTER TABLE "Property"
    ALTER COLUMN "managementFeeFlat" TYPE numeric(14,2) USING round("managementFeeFlat"::numeric, 2),
    ALTER COLUMN "serviceChargeDefault" TYPE numeric(14,2) USING round("serviceChargeDefault"::numeric, 2);
ALTER TABLE "Unit"
    ALTER COLUMN "monthlyRent" TYPE numeric(14,2) USING round("monthlyRent"::numeric, 2);
ALTER TABLE "Tenant"
    ALTER COLUMN "depositAmount" TYPE numeric(14,2) USING round("depositAmount"::numeric, 2),
    ALTER COLUMN "monthlyRent" TYPE numeric(14,2) USING round("monthlyRent"::numeric, 2),
    ALTER COLUMN "serviceCharge" TYPE numeric(14,2) USING round("serviceCharge"::numeric, 2),
    ALTER COLUMN "proposedRent" TYPE numeric(14,2) USING round("proposedRent"::numeric, 2),
    ALTER COLUMN "parkingFee" TYPE numeric(14,2) USING round("parkingFee"::numeric, 2);
ALTER TABLE "RentHistory"
    ALTER COLUMN "monthlyRent" TYPE numeric(14,2) USING round("monthlyRent"::numeric, 2);
ALTER TABLE "IncomeEntry"
    ALTER COLUMN "grossAmount" TYPE numeric(14,2) USING round("grossAmount"::numeric, 2),
    ALTER COLUMN "agentCommission" TYPE numeric(14,2) USING round("agentCommission"::numeric, 2),
    ALTER COLUMN "nightlyRate" TYPE numeric(14,2) USING round("nightlyRate"::numeric, 2),
    ALTER COLUMN "taxAmount" TYPE numeric(14,2) USING round("taxAmount"::numeric, 2);
ALTER TABLE "ExpenseEntry"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2),
    ALTER COLUMN "amountPaid" TYPE numeric(14,2) USING round("amountPaid"::numeric, 2),
    ALTER COLUMN "vatAmount" TYPE numeric(14,2) USING round("vatAmount"::numeric, 2);
ALTER TABLE "ExpenseLineItem"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2),
    ALTER COLUMN "taxAmount" TYPE numeric(14,2) USING round("taxAmount"::numeric, 2),
    ALTER COLUMN "amountPaid" TYPE numeric(14,2) USING round("amountPaid"::numeric, 2);
ALTER TABLE "ExpenseUnitAllocation"
    ALTER COLUMN "shareAmount" TYPE numeric(14,2) USING round("shareAmount"::numeric, 2);
ALTER TABLE "PettyCash"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2);
ALTER TABLE "ManagementFeeConfig"
    ALTER COLUMN "flatAmount" TYPE numeric(14,2) USING round("flatAmount"::numeric, 2);
ALTER TABLE "MaintenanceJob"
    ALTER COLUMN "cost" TYPE numeric(14,2) USING round("cost"::numeric, 2);
ALTER TABLE "ApprovalRequest"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2);
ALTER TABLE "Invoice"
    ALTER COLUMN "rentAmount" TYPE numeric(14,2) USING round("rentAmount"::numeric, 2),
    ALTER COLUMN "serviceCharge" TYPE numeric(14,2) USING round("serviceCharge"::numeric, 2),
    ALTER COLUMN "otherCharges" TYPE numeric(14,2) USING round("otherCharges"::numeric, 2),
    ALTER COLUMN "totalAmount" TYPE numeric(14,2) USING round("totalAmount"::numeric, 2),
    ALTER COLUMN "paidAmount" TYPE numeric(14,2) USING round("paidAmount"::numeric, 2);
ALTER TABLE "OwnerInvoice"
    ALTER COLUMN "totalAmount" TYPE numeric(14,2) USING round("totalAmount"::numeric, 2),
    ALTER COLUMN "paidAmount" TYPE numeric(14,2) USING round("paidAmount"::numeric, 2);
ALTER TABLE "ArrearsCase"
    ALTER COLUMN "amountOwed" TYPE numeric(14,2) USING round("amountOwed"::numeric, 2);
ALTER TABLE "RecurringExpense"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2);
ALTER TABLE "DepositSettlement"
    ALTER COLUMN "depositHeld" TYPE numeric(14,2) USING round("depositHeld"::numeric, 2),
    ALTER COLUMN "totalDeductions" TYPE numeric(14,2) USING round("totalDeductions"::numeric, 2),
    ALTER COLUMN "netRefunded" TYPE numeric(14,2) USING round("netRefunded"::numeric, 2);
ALTER TABLE "InsurancePolicy"
    ALTER COLUMN "premiumAmount" TYPE numeric(14,2) USING round("premiumAmount"::numeric, 2),
    ALTER COLUMN "coverageAmount" TYPE numeric(14,2) USING round("coverageAmount"::numeric, 2);
ALTER TABLE "Asset"
    ALTER COLUMN "purchaseCost" TYPE numeric(14,2) USING round("purchaseCost"::numeric, 2);
ALTER TABLE "AssetMaintenanceSchedule"
    ALTER COLUMN "estimatedCost" TYPE numeric(14,2) USING round("estimatedCost"::numeric, 2);
ALTER TABLE "AssetMaintenanceLog"
    ALTER COLUMN "cost" TYPE numeric(14,2) USING round("cost"::numeric, 2);
ALTER TABLE "ManagementAgreement"
    ALTER COLUMN "leaseRenewalFeeFlat" TYPE numeric(14,2) USING round("leaseRenewalFeeFlat"::numeric, 2),
    ALTER COLUMN "repairAuthorityLimit" TYPE numeric(14,2) USING round("repairAuthorityLimit"::numeric, 2),
    ALTER COLUMN "setupFeeTotal" TYPE numeric(14,2) USING round("setupFeeTotal"::numeric, 2);
ALTER TABLE "CheckoutProcess"
    ALTER COLUMN "inventoryDamageAmount" TYPE numeric(14,2) USING round("inventoryDamageAmount"::numeric, 2),
    ALTER COLUMN "rentBalanceOwing" TYPE numeric(14,2) USING round("rentBalanceOwing"::numeric, 2),
    ALTER COLUMN "originalDeposit" TYPE numeric(14,2) USING round("originalDeposit"::numeric, 2),
    ALTER COLUMN "totalDeductions" TYPE numeric(14,2) USING round("totalDeductions"::numeric, 2),
    ALTER COLUMN "balanceToRefund" TYPE numeric(14,2) USING round("balanceToRefund"::numeric, 2);
ALTER TABLE "CheckoutDeduction"
    ALTER COLUMN "amount" TYPE numeric(14,2) USING round("amount"::numeric, 2);
