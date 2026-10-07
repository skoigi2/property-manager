/**
 * Does the database match prisma/schema.prisma? Exits 1 when it doesn't.
 *
 *   npm run db:drift                    (local DB — after running a new migration's SQL)
 *   npm run prod -- npm run db:drift    (production)
 *
 * Why: a schema change synced with `prisma db push` but never given a
 * migration reaches dev and not production (2026-10-01: production lacked the
 * owner-fee income types, three property categories, the TAX_ID document
 * category and nine indexes — repaired by 20261001100000_schema_drift_repair).
 * Running each new migration's SQL locally and then this check proves the
 * migration covers the whole schema change.
 *
 * KNOWN_DRIFT lists production differences reviewed as harmless; anything
 * else fails.
 */
import { spawnSync } from "child_process";

const KNOWN_DRIFT: { match: string; why: string }[] = [
  // Constraints created by hand-written SQL without ON UPDATE CASCADE / with
  // NO ACTION — ids are never updated, so the update rule never fires.
  { match: `"ApprovalRequest_requestedByUserId_fkey"`, why: "same FK, no ON UPDATE CASCADE" },
  { match: `"UserOrganizationMembership_organizationId_fkey"`, why: "same FK, no ON UPDATE CASCADE" },
  { match: `"UserOrganizationMembership_userId_fkey"`, why: "same FK, no ON UPDATE CASCADE" },
  // Column defaults Prisma supplies itself on insert.
  { match: `"CaseEvent" ALTER COLUMN "attachmentUrls" DROP DEFAULT`, why: "client-side default" },
  { match: `"PaymentAccount" ALTER COLUMN "updatedAt" DROP DEFAULT`, why: "client-side default" },
  { match: `"UserOrganizationMembership" ALTER COLUMN "id" DROP DEFAULT`, why: "client-side default" },
  // Partial unique index (one post-stay check per booking) — Prisma can't express it.
  { match: `"ConditionReport_post_stay_booking_key"`, why: "partial unique index, hand-written SQL" },
];

const diff = spawnSync(
  "npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script",
  { shell: true, encoding: "utf8" },
);
if (diff.status !== 0) {
  console.error(diff.stderr || diff.stdout);
  process.exit(1);
}

// One statement per "-- Kind" block (a block may span lines).
const statements = diff.stdout
  .split(/^-- [A-Za-z]+\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !/^-- This is an empty migration/.test(s));

const known: string[] = [];
const unexpected: string[] = [];
for (const s of statements) {
  const hit = KNOWN_DRIFT.find((k) => s.includes(k.match));
  if (hit) known.push(`${s.split("\n")[0].slice(0, 110)}  (${hit.why})`);
  else unexpected.push(s);
}

if (known.length) console.log(`Known, reviewed drift (${known.length}):\n  ${known.join("\n  ")}\n`);
if (unexpected.length) {
  console.error(`Schema drift — the database does not match prisma/schema.prisma:\n\n${unexpected.join("\n\n")}\n`);
  console.error("Write a migration for it (prisma/migrations/<timestamp>_<name>/migration.sql) and apply it.");
  process.exit(1);
}
console.log("No schema drift.");
