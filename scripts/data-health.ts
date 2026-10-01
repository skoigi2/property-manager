/**
 * Data health report — read-only integrity checks across every organisation
 * (the checks live in src/lib/data-health.ts; the cron emails them weekly).
 *
 *   npm run data:health                     (local DB)
 *   npm run prod -- npm run data:health     (production)
 *   … -- --include-demos                    (sample properties too; skipped by default)
 *
 * Exits 1 when any check finds rows, so it can gate a deploy.
 */
import "./server-only-shim";

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { runDataHealthChecks } = await import("@/lib/data-health");
  const includeDemos = process.argv.includes("--include-demos");
  console.log(`Data health — ${includeDemos ? "including" : "excluding"} sample properties\n`);

  const results = await runDataHealthChecks({ includeDemos });
  let failing = 0;
  for (const r of results) {
    if (r.rows.length === 0) {
      console.log(`ok    ${r.name}`);
      continue;
    }
    failing++;
    console.log(`FAIL  ${r.name} — ${r.rows.length}\n      ${r.why}`);
    for (const row of r.rows.slice(0, 15)) console.log(`      · ${Object.values(row).join(" | ")}`);
    if (r.rows.length > 15) console.log(`      … and ${r.rows.length - 15} more`);
  }
  console.log(failing ? `\n${failing} check(s) found rows` : "\nAll checks clean");
  await prisma.$disconnect();
  if (failing) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
