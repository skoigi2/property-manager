-- Monthly Wi-Fi charge per tenant, billed on the rent invoice and booked like
-- water / electricity (UTILITY_RECOVERY tagged WIFI). Income entries get their
-- own recovery enum so the meter enum (UtilityType) stays water / electricity.

DO $$ BEGIN
  CREATE TYPE "UtilityRecoveryType" AS ENUM ('WATER', 'ELECTRICITY', 'WIFI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'IncomeEntry' AND column_name = 'utilityType') = 'UtilityType' THEN
    ALTER TABLE "IncomeEntry"
      ALTER COLUMN "utilityType" TYPE "UtilityRecoveryType"
      USING "utilityType"::text::"UtilityRecoveryType";
  END IF;
END $$;

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "wifiCharge" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "wifiAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
