/**
 * Merge duplicate EMAIL_SENT case events written before the timeline mirror
 * learned to collapse one notification into one event (src/lib/email.ts
 * mirrorEmailToCase). Until then every recipient of a manager notification
 * produced its own identical row on the case timeline.
 *
 * Rule: within one case thread, EMAIL_SENT events whose subject line (body up
 * to the first newline) matches and whose createdAt falls within 10 minutes of
 * the group's earliest event are merged into that earliest event —
 * meta.recipients / meta.emailLogIds accumulate — and the later rows are
 * deleted. Idempotent: a second run finds nothing to merge.
 *
 *   npx tsx scripts/dedupe-email-events.ts --dry-run     # report only
 *   npx tsx scripts/dedupe-email-events.ts               # apply
 *   DATABASE_URL=... (or DIRECT_URL via env) to target another database.
 *
 * Writes scripts/backfill-output-<timestamp>.md with the per-case summary.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const url = process.env.TARGET_DATABASE_URL;
const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
const DRY = process.argv.includes("--dry-run");
const WINDOW_MS = 10 * 60 * 1000;

type Ev = { id: string; caseThreadId: string; body: string | null; meta: unknown; createdAt: Date };

function subjectOf(e: Ev): string {
  return (e.body ?? "").split("\n")[0].trim();
}
function metaOf(e: Ev): Record<string, unknown> {
  return e.meta && typeof e.meta === "object" ? { ...(e.meta as Record<string, unknown>) } : {};
}
function listOf(meta: Record<string, unknown>, plural: string, singular: string): string[] {
  if (Array.isArray(meta[plural])) return [...(meta[plural] as string[])];
  return meta[singular] ? [String(meta[singular])] : [];
}

async function main() {
  const events = await prisma.caseEvent.findMany({
    where: { kind: "EMAIL_SENT" },
    select: { id: true, caseThreadId: true, body: true, meta: true, createdAt: true },
    orderBy: [{ caseThreadId: "asc" }, { createdAt: "asc" }],
  });

  // Group: thread → subject → clusters within the merge window of the cluster's first event.
  const clusters: Ev[][] = [];
  const byKey = new Map<string, Ev[][]>();
  for (const e of events) {
    const key = `${e.caseThreadId}::${subjectOf(e)}`;
    const groups = byKey.get(key) ?? [];
    const last = groups[groups.length - 1];
    if (last && e.createdAt.getTime() - last[0].createdAt.getTime() <= WINDOW_MS) last.push(e);
    else groups.push([e]);
    byKey.set(key, groups);
  }
  for (const groups of byKey.values()) for (const g of groups) if (g.length > 1) clusters.push(g);

  const lines: string[] = [
    `# Dedupe EMAIL_SENT case events — ${new Date().toISOString()} ${DRY ? "(DRY RUN)" : ""}`,
    "",
    `EMAIL_SENT events scanned: ${events.length}`,
    `Duplicate clusters found: ${clusters.length}`,
    `Rows to remove: ${clusters.reduce((n, c) => n + c.length - 1, 0)}`,
    "",
  ];

  let removed = 0;
  for (const cluster of clusters) {
    const [keep, ...dupes] = cluster;
    const meta = metaOf(keep);
    const recipients = listOf(meta, "recipients", "recipient");
    const emailLogIds = listOf(meta, "emailLogIds", "emailLogId");
    for (const d of dupes) {
      const dm = metaOf(d);
      for (const r of listOf(dm, "recipients", "recipient")) if (!recipients.includes(r)) recipients.push(r);
      for (const l of listOf(dm, "emailLogIds", "emailLogId")) if (!emailLogIds.includes(l)) emailLogIds.push(l);
    }
    lines.push(`- case ${keep.caseThreadId} · "${subjectOf(keep).slice(0, 60)}" · keep ${keep.id}, remove ${dupes.length} → recipients: ${recipients.join(", ") || "(none)"}`);
    if (!DRY) {
      await prisma.$transaction([
        prisma.caseEvent.update({ where: { id: keep.id }, data: { meta: { ...meta, recipients, emailLogIds } } }),
        prisma.caseEvent.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } }),
      ]);
    }
    removed += dupes.length;
  }

  lines.push("", `${DRY ? "Would remove" : "Removed"} ${removed} duplicate row(s).`);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `backfill-output-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\nReport: ${outPath}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
