import { requireOpsStaff, requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { quoteRequestSchema } from "@/lib/validations";
import { caseNote, emailQuoteRequest, loadQuoteJob, newQuoteLink, quoteLinkUrl, serializeQuotes } from "@/lib/quotes";

// Quotes on a maintenance job — ops staff incl. CARETAKER request them (one
// link per vendor); accepting one is manager-only ([quoteId] route).

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaff();
  if (error) return error;
  const loaded = await loadQuoteJob(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  return Response.json(await serializeQuotes(loaded.job, session!));
}

/** POST { vendorIds, message? } — a quote link per vendor, emailed when they have an address. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadQuoteJob(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const job = loaded.job;
  if (job.status === "DONE" || job.status === "CANCELLED") return Response.json({ error: "This job is closed." }, { status: 409 });

  const parsed = quoteRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const vendorIds = Array.from(new Set(parsed.data.vendorIds));
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: vendorIds }, isActive: true, organizationId: job.property.organizationId ?? "__none__" },
    select: { id: true, name: true, email: true },
  });
  if (vendors.length !== vendorIds.length) return Response.json({ error: "Pick active vendors from your list." }, { status: 400 });

  const actorName = session!.user.name ?? session!.user.email ?? "Staff";
  const results: { vendorName: string; url: string | null; emailed: boolean; skipped?: string }[] = [];
  for (const v of vendors) {
    const existing = job.quotes.find((q) => q.vendorId === v.id);
    if (existing && (existing.status === "ACCEPTED" || existing.status === "DECLINED")) {
      results.push({ vendorName: v.name, url: null, emailed: false, skipped: existing.status === "ACCEPTED" ? "already accepted" : "already declined" });
      continue;
    }
    const link = newQuoteLink();
    if (existing) {
      await prisma.maintenanceQuote.update({ where: { id: existing.id }, data: link });
    } else {
      await prisma.maintenanceQuote.create({
        data: { jobId: job.id, vendorId: v.id, ...link, requestedByUserId: session!.user.id, requestedByName: actorName },
      });
    }
    const url = quoteLinkUrl(link.linkToken);
    results.push({ vendorName: v.name, url, emailed: await emailQuoteRequest(job, v, url, parsed.data.message ?? null) });
  }

  const asked = results.filter((r) => !r.skipped).map((r) => r.vendorName);
  if (asked.length) await caseNote(job, actorName, `Quote requested from ${asked.join(", ")}.`, "quote_requested");
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "MaintenanceQuote",
    resourceId: job.id,
    organizationId: job.property.organizationId,
    after: { vendors: results.map((r) => ({ vendor: r.vendorName, emailed: r.emailed, skipped: r.skipped ?? null })) },
  });

  const reloaded = await loadQuoteJob(job.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json({ results, ...(await serializeQuotes(reloaded.job, session!)) }, { status: 201 });
}
