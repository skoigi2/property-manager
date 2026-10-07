/**
 * Stand-in file storage for recordings and guide screenshots.
 *
 * Local dev has no Supabase storage keys, so photo and ID uploads return 503
 * and stored files have no signed URL. For the inspection and guest-stay
 * tutorials this intercepts, in the browser context only:
 *   - inspection photo uploads (POST /api/condition-reports/[id]/photos), the
 *     tenant's signature (POST …/signature — stored as fixtures/photos/signature.png) and
 *     guest ID uploads (POST /api/stays/[id]/guests/[guestId]/documents):
 *     the database row is written directly with storagePath "fixture:<file>",
 *     where <file> is the uploaded file's name in fixtures/photos/;
 *   - every JSON response from /api/condition-reports/… and /api/stays/…:
 *     a null `url` on a fixture row becomes /__fixtures/<file>, which is
 *     served from fixtures/photos/.
 * Nothing on the server changes; the app code paths are the real ones.
 */
import type { BrowserContext, Page, Route } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

export const PHOTO_DIR = path.join(__dirname, "fixtures", "photos");
/** Signatures drawn on camera (output/ is gitignored). */
const SIGNATURE_DIR = path.join(__dirname, "output", "signatures");
const PREFIX = "fixture:";

/** A storage path the fake storage serves (use when seeding rows directly). */
export const fixturePath = (file: string) => `${PREFIX}${file}`;

function fileNameOf(route: Route): string {
  const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
  return body.match(/filename="([^"]+)"/)?.[1] ?? "living-room.jpg";
}

export async function fakeStorage(
  page: Page,
  prisma: PrismaClient,
  opts: { baseUrl: string; uploaderEmail: string },
): Promise<void> {
  const ctx: BrowserContext = page.context();
  const uploader = await prisma.user.findUnique({ where: { email: opts.uploaderEmail }, select: { id: true } });

  async function rewrite(body: unknown): Promise<unknown> {
    const ids: string[] = [];
    const walk = (v: unknown, fn: (o: Record<string, unknown>) => void) => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
      else if (v && typeof v === "object") {
        fn(v as Record<string, unknown>);
        Object.values(v).forEach((x) => walk(x, fn));
      }
    };
    walk(body, (o) => { if ("url" in o && o.url === null && typeof o.id === "string") ids.push(o.id); });
    const [photos, docs] = await Promise.all([
      prisma.conditionReportPhoto.findMany({ where: { id: { in: ids }, storagePath: { startsWith: PREFIX } }, select: { id: true, storagePath: true } }),
      prisma.guestDocument.findMany({ where: { id: { in: ids }, storagePath: { startsWith: PREFIX } }, select: { id: true, storagePath: true } }),
    ]);
    const url = new Map([...photos, ...docs].map((r) => [r.id, `${opts.baseUrl}/__fixtures/${r.storagePath.slice(PREFIX.length)}`]));
    walk(body, (o) => { if (typeof o.id === "string" && url.has(o.id) && o.url === null) o.url = url.get(o.id); });
    // The inspection's signature is a field, not a row with a url.
    const b = body as Record<string, unknown> | null;
    if (b && typeof b.id === "string" && b.tenantSignatureUrl === null) {
      const r = await prisma.conditionReport.findUnique({ where: { id: b.id }, select: { tenantSignaturePath: true } });
      if (r?.tenantSignaturePath?.startsWith(PREFIX)) b.tenantSignatureUrl = `${opts.baseUrl}/__fixtures/${r.tenantSignaturePath.slice(PREFIX.length)}`;
    }
    return body;
  }

  // Lowest priority first: Playwright tries the most recently registered route first.
  await ctx.route(/\/api\/(condition-reports|stays)\//, async (route) => {
    const res = await route.fetch();
    if (!(res.headers()["content-type"] ?? "").includes("application/json")) return route.fulfill({ response: res });
    const body = await res.json().catch(() => null);
    return route.fulfill({ response: res, json: await rewrite(body) });
  });

  await ctx.route(/\/__fixtures\//, (route) => {
    const file = decodeURIComponent(route.request().url().split("/__fixtures/")[1]);
    const own = path.join(SIGNATURE_DIR, file);
    return route.fulfill({ path: fs.existsSync(own) ? own : path.join(PHOTO_DIR, file), contentType: file.endsWith(".png") ? "image/png" : "image/jpeg" });
  });

  await ctx.route(/\/api\/condition-reports\/[^/]+\/signature$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const reportId = route.request().url().match(/condition-reports\/([^/]+)\/signature/)![1];
    const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
    const name = body.match(/name="name"\r\n\r\n([^\r]+)/)?.[1]?.trim() || "Tenant";
    const signedAt = new Date();
    // Keep the PNG that was drawn on camera, so the review shows the same signature.
    let file = "signature.png";
    const raw = route.request().postDataBuffer();
    const start = raw ? raw.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : -1;
    if (raw && start >= 0) {
      const end = raw.indexOf(Buffer.from("\r\n--"), start);
      file = `signature-${reportId}.png`;
      fs.mkdirSync(SIGNATURE_DIR, { recursive: true });
      fs.writeFileSync(path.join(SIGNATURE_DIR, file), raw.subarray(start, end > start ? end : undefined));
    }
    await prisma.conditionReport.update({
      where: { id: reportId },
      data: { tenantSignaturePath: fixturePath(file), tenantSignOff: "SIGNED", tenantSignedName: name, tenantSignedAt: signedAt, status: "IN_PROGRESS" },
    });
    return route.fulfill({ status: 201, json: { url: `${opts.baseUrl}/__fixtures/${file}`, tenantSignedName: name, tenantSignedAt: signedAt } });
  });

  await ctx.route(/\/api\/condition-reports\/[^/]+\/photos$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const reportId = route.request().url().match(/condition-reports\/([^/]+)\/photos/)![1];
    const file = fileNameOf(route);
    const ph = await prisma.conditionReportPhoto.create({
      data: { reportId, storagePath: fixturePath(file), fileName: file, mimeType: "image/jpeg", fileSize: 60_000 },
    });
    return route.fulfill({ status: 201, json: { id: ph.id, fileName: file, url: `${opts.baseUrl}/__fixtures/${file}` } });
  });

  await ctx.route(/\/api\/stays\/[^/]+\/guests\/[^/]+\/documents$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const [, stayId, guestId] = route.request().url().match(/stays\/([^/]+)\/guests\/([^/]+)\/documents/)!;
    const file = fileNameOf(route);
    await prisma.guestDocument.create({
      data: { guestId, incomeEntryId: stayId, label: "ID document", fileName: file, storagePath: fixturePath(file), mimeType: "image/jpeg", fileSize: 60_000, uploadedByUserId: uploader?.id ?? null },
    });
    const res = await page.request.get(`${opts.baseUrl}/api/stays/${stayId}`);
    return route.fulfill({ status: 201, json: await rewrite(await res.json()) });
  });
}
