import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { deleteFromStorage, uploadToStorage } from "@/lib/supabase-storage";
import { loadQuoteJob, serializeQuotes } from "@/lib/quotes";

// Attach the quote document (a photo of a paper quote, a PDF the vendor sent
// on WhatsApp) — ops staff incl. CARETAKER, while the quote is undecided.

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function POST(req: Request, props: { params: Promise<{ id: string; quoteId: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadQuoteJob(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const quote = loaded.job.quotes.find((q) => q.id === params.quoteId);
  if (!quote) return Response.json({ error: "Quote not found" }, { status: 404 });
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") return Response.json({ error: "This quote has already been decided." }, { status: 409 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Invalid form data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "File exceeds 10 MB" }, { status: 400 });
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? "image/heic" : "");
  if (!ALLOWED.includes(type)) return Response.json({ error: "Upload a photo or a PDF" }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "quote";
  const path = `maintenance-quotes/${loaded.job.id}/${quote.id}-${Date.now()}-${safeName}`;
  try {
    await uploadToStorage(path, Buffer.from(await file.arrayBuffer()), type);
  } catch (e) {
    console.error("[quotes] document upload failed:", e);
    return Response.json({ error: "File storage isn't available right now — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  await prisma.maintenanceQuote.update({ where: { id: quote.id }, data: { documentPath: path, documentName: file.name || safeName, documentMime: type } });
  if (quote.documentPath) { try { await deleteFromStorage(quote.documentPath); } catch { /* best-effort */ } }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "MaintenanceQuote",
    resourceId: quote.id,
    organizationId: loaded.job.property.organizationId,
    after: { document: file.name || safeName },
  });
  const reloaded = await loadQuoteJob(loaded.job.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json(await serializeQuotes(reloaded.job, session!), { status: 201 });
}
