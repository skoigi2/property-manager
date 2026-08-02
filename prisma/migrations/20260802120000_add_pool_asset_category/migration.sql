-- Mirror the POOL expense category on the asset taxonomy.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'POOL';
