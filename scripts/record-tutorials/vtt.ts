/**
 * WebVTT generator — converts the recorded cue timeline into
 * public/tutorials/<key>.vtt.
 *
 * Rules enforced:
 *  - cues are ≤2 lines, ≤42 chars per line; longer text is split across
 *    consecutive cues (the available time is divided proportionally)
 *  - minimum cue duration 1.5 s
 *  - no overlaps (each cue ends no later than the next one starts)
 *  - NOTE header with key + generation date
 *
 * The VTT is generated, never hand-edited: to change wording, edit the
 * subtitle line in docs/tutorials/<key>.md and re-record.
 */
import * as fs from "fs";
import * as path from "path";
import type { Cue } from "./harness";

const MAX_LINE = 42;
const MAX_LINES = 2;
const MIN_CUE_MS = 1500;

function ts(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = t % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs, 3)}`;
}

/** Greedy word-wrap into lines of ≤ MAX_LINE chars. */
function wrapLines(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > MAX_LINE) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Split one logical cue into display cues of ≤2 lines each. */
function splitCue(cue: Cue): Cue[] {
  const lines = wrapLines(cue.text);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) {
    chunks.push(lines.slice(i, i + MAX_LINES).join("\n"));
  }
  if (chunks.length <= 1) return [{ ...cue, text: chunks[0] ?? cue.text }];

  // Divide the cue's time across chunks proportionally to their length.
  const total = cue.end - cue.start;
  const weights = chunks.map((c) => c.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const out: Cue[] = [];
  let t = cue.start;
  for (let i = 0; i < chunks.length; i++) {
    const dur = Math.max(MIN_CUE_MS, Math.round((total * weights[i]) / weightSum));
    const end = i === chunks.length - 1 ? cue.end : Math.min(cue.end, t + dur);
    out.push({ start: t, end, text: chunks[i] });
    t = end;
  }
  return out;
}

export function generateVtt(key: string, cues: Cue[], outDir: string): string {
  // 1. split long cues, 2. enforce min duration, 3. remove overlaps
  let display = cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .flatMap(splitCue);

  for (const c of display) {
    if (c.end - c.start < MIN_CUE_MS) c.end = c.start + MIN_CUE_MS;
  }
  for (let i = 0; i < display.length - 1; i++) {
    if (display[i].end > display[i + 1].start) {
      display[i].end = Math.max(display[i].start + MIN_CUE_MS, display[i + 1].start);
      // If min-duration forces an overlap, push the next cue instead.
      if (display[i].end > display[i + 1].start) {
        display[i + 1].start = display[i].end;
        if (display[i + 1].end < display[i + 1].start + MIN_CUE_MS) {
          display[i + 1].end = display[i + 1].start + MIN_CUE_MS;
        }
      }
    }
  }

  const lines: string[] = [
    "WEBVTT",
    "",
    `NOTE`,
    `Tutorial: ${key}`,
    `Generated: ${new Date().toISOString()}`,
    `Source of truth: docs/tutorials/${key}.md — edit there and re-record.`,
    "",
  ];
  display.forEach((c, i) => {
    lines.push(String(i + 1), `${ts(c.start)} --> ${ts(c.end)}`, c.text, "");
  });

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${key}.vtt`);
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  return outPath;
}
