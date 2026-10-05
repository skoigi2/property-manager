-- Per-organisation setting: caretakers may see tenants' rent, Wi-Fi, deposit and
-- balances on the inspections they run. Off by default (owner decision 2026-10-05).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "caretakersSeeTenantMoney" BOOLEAN NOT NULL DEFAULT false;
