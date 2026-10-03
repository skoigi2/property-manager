import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Next 15: the `params` and `searchParams` a route handler, page or layout
 * receives are Promises — `await props.params` at the top of the handler
 * (client pages: `use(props.params)` or `useParams()`). Typing them as plain
 * objects still compiles in places but reads `undefined` at runtime, so this
 * test fails on any `params: {` / `searchParams: {` type in src/app.
 */
const APP = join(process.cwd(), "src", "app");
const ENTRY_FILES = new Set(["route.ts", "page.tsx", "layout.tsx"]);
const SYNC_TYPE = /\b(params|searchParams)\??:\s*\{/;

function entryFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? entryFiles(p) : ENTRY_FILES.has(f) ? [p] : [];
  });
}

describe("Next 15 async request APIs", () => {
  it("types params / searchParams as Promises in every route, page and layout", () => {
    const offenders = entryFiles(APP)
      .filter((file) => SYNC_TYPE.test(readFileSync(file, "utf8")))
      .map((file) => relative(APP, file).split("\\").join("/"));
    expect(offenders).toEqual([]);
  });

  it("awaits cookies() / headers()", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) scan(p);
        else if (/\.tsx?$/.test(f) && /(?<!await |await \()\b(cookies|headers)\(\)\./.test(readFileSync(p, "utf8"))) {
          offenders.push(relative(process.cwd(), p).split("\\").join("/"));
        }
      }
    };
    scan(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
