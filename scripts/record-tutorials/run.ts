/**
 * Tutorial recorder orchestrator.
 *
 *   npm run tutorials:record [key|all] [--burn]
 *
 * Pipeline per tutorial: seed-state → record (Playwright) → vtt → postprocess
 * (ffmpeg via bash). Prints output paths + actual vs target duration, and
 * updates `durationSec` in src/lib/tutorial-videos.ts to the actual value.
 *
 * Requirements: dev server on localhost:3000, local/dev DATABASE_URL
 * (seed-state refuses anything else), ffmpeg + bash on PATH.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { TUTORIAL_ORDER, TUTORIAL_VIDEOS, type TutorialKey } from "../../src/lib/tutorial-videos";
import { seedForTutorial, disconnect } from "./seed-state";
import { generateVtt } from "./vtt";
import { BASE_URL } from "./harness";
import type { Cue } from "./harness";

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_TUTORIALS = path.join(ROOT, "public", "tutorials");
const REGISTRY_PATH = path.join(ROOT, "src", "lib", "tutorial-videos.ts");

type RecordResult = { videoPath: string; timelinePath: string; durationMs: number };
type RecorderModule = { record: () => Promise<RecordResult> };

async function assertDevServer(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/login`, { method: "HEAD" });
    if (!res.ok && res.status >= 500) throw new Error(String(res.status));
  } catch {
    throw new Error(`No dev server reachable at ${BASE_URL} — run \`npm run dev\` first.`);
  }
}

function updateRegistryDuration(key: TutorialKey, actualSec: number): void {
  const src = fs.readFileSync(REGISTRY_PATH, "utf8");
  // Each entry starts with `key: "<key>"` — patch the durationSec that follows it.
  const entryAnchor = `key: "${key}",`;
  const idx = src.indexOf(entryAnchor);
  if (idx === -1) {
    console.warn(`  ⚠ could not find registry entry for ${key} — durationSec not updated`);
    return;
  }
  const durIdx = src.indexOf("durationSec:", idx);
  const lineEnd = src.indexOf(",", durIdx);
  const patched = src.slice(0, durIdx) + `durationSec: ${actualSec}` + src.slice(lineEnd);
  fs.writeFileSync(REGISTRY_PATH, patched, "utf8");
  console.log(`  ✓ registry durationSec → ${actualSec}s`);
}

async function runOne(key: TutorialKey, burn: boolean): Promise<void> {
  const meta = TUTORIAL_VIDEOS[key];
  console.log(`\n━━ ${key} (target ${meta.durationSec}s) ━━`);

  console.log("• seeding preconditions");
  await seedForTutorial(key);

  console.log("• recording");
  const mod = (await import(`./${key}`)) as RecorderModule;
  const result = await mod.record();
  const bodySec = Math.round(result.durationMs / 1000);

  console.log("• generating WebVTT");
  const timeline = JSON.parse(fs.readFileSync(result.timelinePath, "utf8")) as { cues: Cue[] };
  // Cues shift by the 2s title card prepended in postprocess.
  const shifted = timeline.cues.map((c) => ({ ...c, start: c.start + 2000, end: c.end + 2000 }));
  const vttPath = generateVtt(key, shifted, PUBLIC_TUTORIALS);

  console.log("• postprocess (ffmpeg)");
  const nextLine = meta.next ? `Next: ${TUTORIAL_VIDEOS[meta.next].title}` : "Groundwork PM";
  execFileSync(
    "bash",
    [
      path.join(__dirname, "postprocess.sh"),
      key,
      meta.title,
      nextLine,
      ...(burn ? ["--burn"] : []),
    ],
    { stdio: "inherit" }
  );

  const totalSec = bodySec + 4; // + title & end cards
  updateRegistryDuration(key, totalSec);

  console.log(`── ${key} done`);
  console.log(`   video:    public/tutorials/${key}.mp4`);
  console.log(`   poster:   public/tutorials/${key}.jpg`);
  console.log(`   vtt:      ${path.relative(ROOT, vttPath)}`);
  console.log(`   timeline: ${path.relative(ROOT, result.timelinePath)}`);
  console.log(
    `   duration: ${totalSec}s actual vs ${meta.durationSec}s target ${
      totalSec > meta.durationSec ? "⚠ OVER TARGET" : "✓"
    }`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const burn = args.includes("--burn");
  const target = (args.find((a) => !a.startsWith("--")) ?? "all") as TutorialKey | "all";

  const keys: TutorialKey[] =
    target === "all" ? TUTORIAL_ORDER : ([target] as TutorialKey[]);
  for (const k of keys) {
    if (!TUTORIAL_VIDEOS[k]) {
      console.error(`Unknown tutorial key "${k}". Valid: ${TUTORIAL_ORDER.join(", ")}`);
      process.exit(1);
    }
  }

  await assertDevServer();
  const failures: string[] = [];
  for (const k of keys) {
    try {
      await runOne(k, burn);
    } catch (err) {
      console.error(`✗ ${k} failed:`, err instanceof Error ? err.message : err);
      failures.push(k);
    }
  }
  await disconnect();
  if (failures.length) {
    console.error(`\nFailed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main();
