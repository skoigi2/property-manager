-- Short stays: alert managers when a guest's or the cleaner's keys aren't back.
-- ADD VALUE only — never used in this same script (Postgres forbids using a
-- new enum label in the transaction that adds it).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STAY_KEYS_NOT_BACK';
ALTER TYPE "HintType" ADD VALUE IF NOT EXISTS 'STAY_KEYS_NOT_BACK';
