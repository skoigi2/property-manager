-- Add facility/plant expense categories.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block —
-- keep each statement top-level (do not wrap in BEGIN/COMMIT).
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'POOL';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'GENERATOR';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'ELEVATOR';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'HVAC';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'GAS';
