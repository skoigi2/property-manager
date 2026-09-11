-- The admin fee line was added alongside the deposit / lease-agreement fee
-- lines but is not part of the standard tenancy agreement; remove it.
-- (The IncomeType value ADMIN_FEE stays: Postgres cannot drop enum values.
-- Nothing writes it.)
ALTER TABLE "Invoice"  DROP COLUMN IF EXISTS "adminFee";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "adminFeeDefault";
