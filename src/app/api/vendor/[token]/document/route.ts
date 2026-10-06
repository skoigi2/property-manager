import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { uploadToStorage, deleteFromStorage } from "@/lib/supabase-storage";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";
import { canAttachByLink, findQuoteByToken } from "@/lib/vendor-quote-link";

// The vendor attaches their quote document (PDF or photo) through their quote
// link — public, the token is the auth; quote links only (not the job's older
// single link). Rate-limited per IP.

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const limited = rateLimit(`vendor-doc:${getClientIp(req)}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const quote = await findQuoteByToken(params.token);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAttachByLink(quote)) return NextResponse.json({ error: "This link is no longer open." }, { status: 410 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 10 MB" }, { status: 400 });
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? "image/heic" : "");
  if (!ALLOWED.includes(type)) return NextResponse.json({ error: "Attach a PDF or a photo" }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "quote";
  const path = `maintenance-quotes/${quote.jobId}/${quote.id}-${Date.now()}-${safeName}`;
  try {
    await uploadToStorage(path, Buffer.from(await file.arrayBuffer()), type);
  } catch (e) {
    console.error("[vendor-link] document upload failed:", e);
    return NextResponse.json({ error: "Upload isn't available right now — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  const previous = await prisma.maintenanceQuote.findUnique({ where: { id: quote.id }, select: { documentPath: true } });
  await prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { documentPath: path, documentName: file.name || safeName, documentMime: type } });
  if (previous?.documentPath) { try { await deleteFromStorage(previous.documentPath); } catch { /* best-effort */ } }

  await logAudit({
    userId: "system",
    userEmail: "vendor-link",
    action: "UPDATE",
    resource: "MaintenanceQuote",
    resourceId: quote.id,
    after: { document: file.name || safeName, token: redactToken(params.token) },
  });
  return NextResponse.json({ ok: true, documentName: file.name || safeName }, { status: 201 });
}
