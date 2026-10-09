-- Platform super-admin becomes an explicit flag. Until now it was inferred
-- from role ADMIN + no organisation, which a fresh Google sign-up also has
-- before it creates its organisation (2026-10-09). The flag is switched on by
-- hand for the real platform admins after this migration.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
