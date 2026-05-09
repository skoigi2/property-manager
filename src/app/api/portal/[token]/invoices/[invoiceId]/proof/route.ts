import { NextRequest } from "next/server";
import crypto from "crypto";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/supabase-storage";
import { sendNotificationEmail, esc } from "@/lib/email";
import type { ProofOfPaymentType } from "@prisma/client";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LEN = 2000;

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; invoiceId: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    select: { id: true, tenantId: true, status: true, invoiceNumber: true, totalAmount: true, periodYear: true, periodMonth: true },
  });

  if (!invoice || invoice.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED" || invoice.status === "DRAFT") {
    return Response.json({ error: "This invoice cannot accept proof of payment" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const text = (form.get("text") as string | null)?.trim() ?? "";
  const file = form.get("file");
  const hasText = text.length > 0;
  const hasFile = file instanceof File && file.size > 0;

  if (!hasText && !hasFile) {
    return Response.json({ error: "Provide a reference text, a file, or both" }, { status: 400 });
  }

  if (hasText && text.length > MAX_TEXT_LEN) {
    return Response.json({ error: `Text must be ${MAX_TEXT_LEN} characters or fewer` }, { status: 400 });
  }

  let storagePath: string | null = null;

  if (hasFile) {
    const f = file as File;
    if (f.size > MAX_BYTES) {
      return Response.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return Response.json({ error: "Unsupported file type" }, { status: 400 });
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const id = crypto.randomUUID();
    storagePath = `proofs/${tenant.id}/${invoice.id}/${id}-${safeFilename(f.name || "proof")}`;
    try {
      await uploadToStorage(storagePath, buffer, f.type);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      return Response.json({ error: `Upload failed: ${msg}` }, { status: 500 });
    }
  }

  const proofType: ProofOfPaymentType =
    hasText && hasFile ? "BOTH" : hasText ? "TEXT" : "FILE";

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      proofOfPaymentUrl: storagePath,
      proofOfPaymentText: hasText ? text : null,
      proofOfPaymentType: proofType,
      proofSubmittedAt: new Date(),
      status: "PENDING_VERIFICATION",
    },
  });

  // Notify managers (best-effort).
  try {
    const property = tenant.unit.property;
    const orgId = property.organizationId;
    if (orgId) {
      const recipients = await prisma.user.findMany({
        where: {
          isActive: true,
          email: { not: null },
          OR: [
            { organizationId: orgId, role: "ADMIN" },
            { role: "MANAGER", propertyAccess: { some: { propertyId: property.id } } },
          ],
        },
        select: { email: true, id: true },
      });

      const subject = `Payment proof submitted — ${tenant.name} (Invoice ${invoice.invoiceNumber})`;
      const fileBlock = storagePath
        ? `<p style="margin:8px 0;color:#374151"><strong>File attached:</strong> open the tenant's invoice in your dashboard to view.</p>`
        : "";
      const textBlock = hasText
        ? `<p style="margin:8px 0;color:#374151"><strong>Reference provided:</strong></p>
           <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-family:monospace;font-size:12px;white-space:pre-wrap;color:#1a1a2e">${esc(text)}</pre>`
        : "";
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
          <h2 style="margin:0 0 8px 0;font-size:20px">Payment proof submitted</h2>
          <p style="color:#6b7280;font-size:14px;margin-top:0">
            ${esc(tenant.name)} has flagged invoice <strong>${esc(invoice.invoiceNumber)}</strong>
            (${invoice.periodMonth}/${invoice.periodYear}) as paid and submitted proof for review.
          </p>
          ${textBlock}
          ${fileBlock}
          <p style="margin-top:16px;color:#6b7280;font-size:13px">
            Verify and mark the invoice as paid in the dashboard.
          </p>
        </div>
      `;

      for (const r of recipients) {
        if (!r.email) continue;
        try {
          await sendNotificationEmail(r.email, subject, html, { organizationId: orgId, userId: r.id });
        } catch (err) {
          console.error("[proof] email failed", err);
        }
      }
    }
  } catch (err) {
    console.error("[proof] notification block failed", err);
  }

  return Response.json({ ok: true, status: "PENDING_VERIFICATION" });
}
