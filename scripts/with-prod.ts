/**
 * Runs a script or command against the PRODUCTION database.
 *
 *   npm run prod -- scripts/reseed-demos.ts            (dry run — the scripts default to it)
 *   npm run prod -- scripts/reseed-demos.ts --apply
 *   npm run prod -- npx prisma migrate status
 *
 * Pulls the production env from Vercel into a temp folder, reads DIRECT_URL
 * (the direct 5432 connection — one-off scripts and migrations), deletes the
 * file straight away, then runs the target with DATABASE_URL and DIRECT_URL
 * set to it. The credentials only ever live in the child's environment — never
 * on disk past the parse, even when the target fails.
 *
 * Needs the Vercel CLI logged in and the project linked (`npx vercel link`).
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function readDirectUrl(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gwpm-prod-"));
  const file = path.join(dir, "prod.env");
  try {
    const pull = spawnSync(`npx vercel env pull "${file}" --environment=production --yes`, {
      shell: true,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    if (pull.status !== 0 || !fs.existsSync(file)) {
      throw new Error(`vercel env pull failed — is the CLI logged in and the project linked?\n${pull.stderr ?? ""}`);
    }
    const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith("DIRECT_URL="));
    const url = line?.slice("DIRECT_URL=".length).trim().replace(/^"(.*)"$/, "$1");
    if (!url) throw new Error("DIRECT_URL is not set in the production environment.");
    return url;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npm run prod -- <script.ts | command> [args…]");
    return 2;
  }
  const [target, ...rest] = args;
  const isScript = /\.(ts|js|mjs|cjs)$/.test(target);
  if (isScript && !fs.existsSync(target)) {
    console.error(`No such script: ${target}`);
    return 2;
  }

  const url = readDirectUrl();
  console.log(`▶ PRODUCTION database ${new URL(url).hostname} — ${[target, ...rest].join(" ")}\n`);

  // One command string (npx needs a shell on Windows); quote what needs it.
  const quote = (a: string) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
  const command = (isScript ? ["npx", "tsx", target, ...rest] : [target, ...rest]).map(quote).join(" ");
  const run = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: "production" },
  });
  return run.status ?? 1;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
