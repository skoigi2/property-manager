/**
 * Recording harness for tutorial videos.
 *
 * Launches Chromium at 1280×800 with video recording + slowMo, logs into the
 * recording account via the /login form, injects a visible fake cursor that
 * animates to each target before clicking, and exposes a tiny scripting API:
 *   goto / hover / click / type / upload / pause / say
 *
 * `say(text, ms)` draws NOTHING on screen — it appends a subtitle cue
 * { start, end, text } to the timeline and waits `ms` so the video dwell time
 * matches the cue. The VTT is generated afterwards by vtt.ts.
 *
 * Every helper logs { t, action, detail, findMs } to a JSON timeline saved
 * next to the video; `findMs` > 3000 flags a fragile selector.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.RECORD_EMAIL ?? "guide@groundworkpm.com";
const PASSWORD = process.env.RECORD_PASSWORD ?? "guide-shots-2026";

export const OUTPUT_DIR = path.join(__dirname, "output");

export interface Cue {
  start: number; // ms from recording start
  end: number;
  text: string;
}

export interface TimelineEvent {
  t: number; // ms from recording start
  action: string;
  detail: string;
  findMs?: number; // how long the selector took to resolve
}

const CURSOR_JS = `
(() => {
  if (document.getElementById("gw-rec-cursor")) return;
  const c = document.createElement("div");
  c.id = "gw-rec-cursor";
  c.style.cssText = [
    "position:fixed", "z-index:2147483647", "left:640px", "top:400px",
    "width:22px", "height:22px", "border-radius:50%",
    "background:rgba(198,156,74,0.85)", "border:2px solid #fff",
    "box-shadow:0 1px 6px rgba(0,0,0,0.4)", "pointer-events:none",
    "transition:left 0.45s cubic-bezier(.4,0,.2,1), top 0.45s cubic-bezier(.4,0,.2,1), transform 0.15s ease",
    "transform:translate(-50%,-50%)",
  ].join(";");
  document.body.appendChild(c);
})();`;

export class Harness {
  private browser!: Browser;
  private context!: BrowserContext;
  page!: Page;
  private t0 = 0;
  readonly cues: Cue[] = [];
  readonly timeline: TimelineEvent[] = [];
  readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  private now() {
    return Date.now() - this.t0;
  }

  private log(action: string, detail: string, findMs?: number) {
    this.timeline.push({ t: this.now(), action, detail, findMs });
    const flag = findMs !== undefined && findMs > 3000 ? "  ⚠ SLOW SELECTOR" : "";
    console.log(`  [${(this.now() / 1000).toFixed(1)}s] ${action} ${detail}${flag}`);
  }

  /** Launch, log in, land on /dashboard. Recording starts at launch. */
  async start(): Promise<void> {
    const videoDir = path.join(OUTPUT_DIR, this.key);
    fs.mkdirSync(videoDir, { recursive: true });

    this.browser = await chromium.launch({ headless: true, slowMo: 250 });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
    });

    // Pre-dismiss the welcome tour; hide chrome that would distract
    // (org-switcher, super-admin links) in case the account ever has them.
    await this.context.addInitScript(() => {
      try {
        window.localStorage.setItem("gw:welcome-tour-done", "1");
        window.localStorage.setItem("cases-banner-dismissed", "1");
      } catch {}
    });

    this.page = await this.context.newPage();
    this.t0 = Date.now();

    // Log in (not narrated — happens before the first say()).
    await this.page.goto(`${BASE_URL}/login`);
    await this.page.fill('input[type="email"]', EMAIL);
    await this.page.fill('input[type="password"]', PASSWORD);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL((u) => !u.href.includes("/login"), { timeout: 30000 });
    this.log("login", EMAIL);

    await this.page.addStyleTag({
      content: `
        /* recording: hide elements that vary between accounts */
        a[href="/admin/organizations"], a[href="/admin/emails"], a[href="/admin/hints"] { display: none !important; }
      `,
    }).catch(() => {});
    await this.injectCursor();
  }

  private async injectCursor() {
    await this.page.evaluate(CURSOR_JS).catch(() => {});
  }

  private async moveCursorTo(x: number, y: number) {
    await this.injectCursor();
    await this.page.evaluate(
      ([cx, cy]) => {
        const c = document.getElementById("gw-rec-cursor");
        if (c) {
          c.style.left = `${cx}px`;
          c.style.top = `${cy}px`;
        }
      },
      [x, y]
    );
    await this.page.waitForTimeout(500); // let the transition play
  }

  private async pulseCursor() {
    await this.page
      .evaluate(() => {
        const c = document.getElementById("gw-rec-cursor");
        if (c) {
          c.style.transform = "translate(-50%,-50%) scale(0.7)";
          setTimeout(() => (c.style.transform = "translate(-50%,-50%)"), 150);
        }
      })
      .catch(() => {});
  }

  /** Resolve a selector, animate the cursor to it, return its center. */
  private async aim(sel: string): Promise<{ x: number; y: number; findMs: number }> {
    const started = Date.now();
    const loc = this.page.locator(sel).filter({ visible: true }).first();
    await loc.waitFor({ state: "visible", timeout: 30000 });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const box = await loc.boundingBox();
    const findMs = Date.now() - started;
    if (!box) throw new Error(`No bounding box for selector: ${sel}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.moveCursorTo(x, y);
    return { x, y, findMs };
  }

  async goto(route: string): Promise<void> {
    // Dev-mode route compiles can take a while on first hit.
    await this.page.goto(`${BASE_URL}${route}`, { timeout: 60000 });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    // Wait for data spinners to settle (dev-mode fetches are slow).
    await this.page
      .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, {
        timeout: 20000,
      })
      .catch(() => {});
    await this.injectCursor();
    this.log("goto", route);
  }

  async hover(sel: string): Promise<void> {
    const { findMs } = await this.aim(sel);
    await this.page.locator(sel).filter({ visible: true }).first().hover().catch(() => {});
    this.log("hover", sel, findMs);
  }

  async click(sel: string): Promise<void> {
    const { findMs } = await this.aim(sel);
    await this.pulseCursor();
    await this.page.locator(sel).filter({ visible: true }).first().click();
    await this.injectCursor(); // clicks can navigate — re-inject
    this.log("click", sel, findMs);
  }

  async type(sel: string, text: string): Promise<void> {
    const { findMs } = await this.aim(sel);
    const loc = this.page.locator(sel).filter({ visible: true }).first();
    await loc.click();
    // Date/time inputs don't accept per-keystroke text — fill() sets them
    // reliably (and still fires the change events react-hook-form needs).
    const inputType = await loc.getAttribute("type").catch(() => null);
    if (inputType === "date" || inputType === "datetime-local" || inputType === "month") {
      await loc.fill(text);
    } else {
      await loc.fill("");
      await loc.pressSequentially(text, { delay: 40 });
    }
    this.log("type", `${sel} = "${text}"`, findMs);
  }

  /** Select an option in a native <select>. */
  async select(sel: string, value: string): Promise<void> {
    const { findMs } = await this.aim(sel);
    await this.page.locator(sel).filter({ visible: true }).first().selectOption(value);
    this.log("select", `${sel} = "${value}"`, findMs);
  }

  /** Select an option by its visible label text in a native <select>. */
  async selectByLabel(sel: string, label: string): Promise<void> {
    const { findMs } = await this.aim(sel);
    await this.page.locator(sel).filter({ visible: true }).first().selectOption({ label });
    this.log("select", `${sel} label="${label}"`, findMs);
  }

  /** Select the nth option (0-based) in a native <select> — for "first real option" cases. */
  async selectIndex(sel: string, index: number): Promise<void> {
    const { findMs } = await this.aim(sel);
    await this.page.locator(sel).filter({ visible: true }).first().selectOption({ index });
    this.log("select", `${sel} [index ${index}]`, findMs);
  }

  /**
   * Scope the app to one property (the header property picker persists to
   * sessionStorage). Call before goto() — takes effect on the next navigation.
   */
  async selectProperty(propertyId: string): Promise<void> {
    await this.page.evaluate(
      (id) => window.sessionStorage.setItem("selectedPropertyId", id),
      propertyId
    );
    this.log("selectProperty", propertyId);
  }

  async upload(sel: string, filePath: string): Promise<void> {
    const started = Date.now();
    // File inputs are typically hidden behind styled drop zones — no visible filter.
    await this.page.locator(sel).first().setInputFiles(filePath);
    this.log("upload", `${sel} ← ${path.basename(filePath)}`, Date.now() - started);
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
    this.log("pause", `${ms}ms`);
  }

  /**
   * Append a subtitle cue and dwell for its duration. Draws nothing on screen.
   */
  async say(text: string, ms: number): Promise<void> {
    const start = this.now();
    this.cues.push({ start, end: start + ms, text });
    this.log("say", `"${text}"`);
    await this.page.waitForTimeout(ms);
  }

  /**
   * Stop recording; save the timeline JSON next to the video.
   * Returns { videoPath, timelinePath, durationMs }.
   */
  async finish(): Promise<{ videoPath: string; timelinePath: string; durationMs: number }> {
    const durationMs = this.now();
    const video = this.page.video();
    await this.context.close(); // flushes the video file
    await this.browser.close();

    const videoPath = video ? await video.path() : "";
    const dir = path.join(OUTPUT_DIR, this.key);
    // Playwright names videos randomly — normalise to <key>.webm.
    const finalVideo = path.join(dir, `${this.key}.webm`);
    if (videoPath && fs.existsSync(videoPath) && videoPath !== finalVideo) {
      fs.copyFileSync(videoPath, finalVideo);
      fs.unlinkSync(videoPath);
    }

    const timelinePath = path.join(dir, `${this.key}.timeline.json`);
    fs.writeFileSync(
      timelinePath,
      JSON.stringify({ key: this.key, durationMs, cues: this.cues, events: this.timeline }, null, 2)
    );

    const slow = this.timeline.filter((e) => (e.findMs ?? 0) > 3000);
    if (slow.length) {
      console.warn(`  ⚠ ${slow.length} step(s) took >3s to find their element — fragile selectors:`);
      for (const s of slow) console.warn(`     ${s.action} ${s.detail} (${s.findMs}ms)`);
    }

    return { videoPath: finalVideo, timelinePath, durationMs };
  }
}
