import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Every table in the public schema must have row level security enabled.
 * The app reaches the database through Prisma as the `postgres` role, which
 * bypasses RLS; enabling it with no policies closes the table to Supabase's
 * PostgREST API (the anon / authenticated roles are granted on every public
 * table). New tables have missed this four times — API keys / webhooks, vendor
 * payments, tenant complaints, utility metering — each flagged later by the Supabase security
 * linter as `rls_disabled_in_public`.
 *
 * Fix a failure by adding `ALTER TABLE "<Name>" ENABLE ROW LEVEL SECURITY;`
 * to the migration that creates the table (and run it in production).
 */
const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");

function readMigrations(): string {
  return fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(MIGRATIONS, d.name, "migration.sql"))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

const tableNames = (sql: string, pattern: RegExp) => new Set(Array.from(sql.matchAll(pattern), (m) => m[1]));

describe("migrations: row level security", () => {
  const sql = readMigrations();
  const created = tableNames(sql, /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:"public"\.)?"([A-Za-z0-9_]+)"/g);
  const dropped = tableNames(sql, /DROP TABLE(?: IF EXISTS)?\s+(?:"public"\.)?"([A-Za-z0-9_]+)"/g);
  const secured = tableNames(sql, /ALTER TABLE\s+(?:"public"\.)?"([A-Za-z0-9_]+)"\s+ENABLE ROW LEVEL SECURITY/g);

  it("finds the migrations", () => {
    expect(created.size).toBeGreaterThan(50);
  });

  it("enables RLS on every table a migration creates", () => {
    const missing = Array.from(created).filter((t) => !secured.has(t) && !dropped.has(t)).sort();
    expect(missing).toEqual([]);
  });
});
