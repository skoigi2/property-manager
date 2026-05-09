import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { uploadToStorage, deleteFromStorage } from "@/lib/supabase-storage";
import crypto from "crypto";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  paidAmount: z.number().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  paymentMethod: z.enum(["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"]).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      tenant: { include: { unit: { include: { property: true } } } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.property.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, paidAmount, paidAt, paymentMethod } = parsed.data;

  if (action === "reject") {
    // Best-effort: delete the file (if any), then revert.
    if (invoice.proofOfPaymentUrl) {
      try { await deleteFromStorage(invoice.proofOfPaymentUrl); } catch (e) { console.error("[verify-proof] file delete failed", e); }
    }
    const dueDate = invoice.dueDate;
    const newStatus = dueDate < new Date() ? "OVERDUE" : "SENT";
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus,
        proofOfPaymentUrl: null,
        proofOfPaymentText: null,
        proofOfPaymentType: null,
        proofSubmittedAt: null,
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "Invoice",
      resourceId: invoice.id,
      organizationId: session!.user.organizationId,
      after: { proofRejected: true, status: newStatus },
    });

    return Response.json({ ok: true, status: newStatus });
  }

  // ── Approve path ────────────────────────────────────────────────────────────
  const finalPaidAmount = paidAmount ?? invoice.totalAmount;
  const finalPaidAt = paidAt ? new Date(paidAt) : new Date();

  // Persist proof to TenantDocument vault (audit trail).
  // For text-only proofs, write the text into a .txt file under the tenant's vault prefix.
  let docStoragePath: string | null = invoice.proofOfPaymentUrl;
  let docFileName = "proof-of-payment";
  let docMime = "application/octet-stream";

  if (!docStoragePath && invoice.proofOfPaymentText) {
    const id = crypto.randomUUID();
    const path = `tenants/${invoice.tenantId}/proof-${invoice.invoiceNumber}-${id}.txt`;
    try {
      await uploadToStorage(path, Buffer.from(invoice.proofOfPaymentText, "utf-8"), "text/plain");
      docStoragePath = path;
      docFileName = `proof-${invoice.invoiceNumber}.txt`;
      docMime = "text/plain";
    } catch (e) {
      console.error("[verify-proof] failed to persist text proof to vault", e);
    }
  } else if (docStoragePath) {
    docFileName = docStoragePath.split("/").pop() ?? `proof-${invoice.invoiceNumber}`;
    // Try to infer mime from filename
    if (docFileName.endsWith(".pdf")) docMime = "application/pdf";
    else if (/\.(jpe?g)$/i.test(docFileName)) docMime = "image/jpeg";
    else if (docFileName.endsWith(".png")) docMime = "image/png";
    else if (docFileName.endsWith(".webp")) docMime = "image/webp";
  }

  // ── Atomic-ish update: do invoice update + income create as a tx, document + clear-proof outside.
  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: finalPaidAt,
        paidAmount: finalPaidAmount,
      },
    }),
  ]);

  // Ensure an IncomeEntry exists for this invoice.
  const existing = await prisma.incomeEntry.findFirst({
    where: { invoiceId: invoice.id },
  });
  if (!existing) {
    await prisma.incomeEntry.create({
      data: {
        date: finalPaidAt,
        unitId: invoice.tenant.unit.id,
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        type: "LONGTERM_RENT",
        grossAmount: finalPaidAmount,
        agentCommission: 0,
        paymentMethod: paymentMethod ?? null,
        note: `Auto-created from invoice ${invoice.invoiceNumber} (proof verified)`,
      },
    });
  } else if (paymentMethod && !existing.paymentMethod) {
    await prisma.incomeEntry.update({
      where: { id: existing.id },
      data: { paymentMethod },
    });
  }

  // Persist a TenantDocument record so the proof shows under the tenant's "Payment Receipts".
  if (docStoragePath) {
    try {
      await prisma.tenantDocument.create({
        data: {
          tenantId: invoice.tenantId,
          category: "PAYMENT_RECEIPT",
          label: `Payment proof — Invoice ${invoice.invoiceNumber}`,
          fileName: docFileName,
          storagePath: docStoragePath,
          mimeType: docMime,
        },
      });
    } catch (e) {
      console.error("[verify-proof] failed to create TenantDocument", e);
    }
  }

  // Clear proof fields on the invoice — source of truth is now the TenantDocument.
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      proofOfPaymentUrl: null,
      proofOfPaymentText: null,
      proofOfPaymentType: null,
      proofSubmittedAt: null,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Invoice",
    resourceId: invoice.id,
    organizationId: session!.user.organizationId,
    after: { status: "PAID", paidAmount: finalPaidAmount, paymentMethod },
  });

  return Response.json({ ok: true, status: "PAID" });
}

// GET — fetch a fresh signed URL for the manager drawer's image/PDF preview.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      periodYear: true,
      periodMonth: true,
      proofOfPaymentUrl: true,
      proofOfPaymentText: true,
      proofOfPaymentType: true,
      proofSubmittedAt: true,
      tenant: { select: { id: true, name: true, unit: { select: { property: { select: { id: true } } } } } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.property.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let signedUrl: string | null = null;
  if (invoice.proofOfPaymentUrl) {
    const { getSignedUrl } = await import("@/lib/supabase-storage");
    try {
      signedUrl = await getSignedUrl(invoice.proofOfPaymentUrl, 300);
    } catch (e) {
      console.error("[verify-proof] sign url failed", e);
    }
  }

  return Response.json({
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    proofOfPaymentText: invoice.proofOfPaymentText,
    proofOfPaymentType: invoice.proofOfPaymentType,
    proofSubmittedAt: invoice.proofSubmittedAt,
    proofFileUrl: signedUrl,
    proofFileName: invoice.proofOfPaymentUrl?.split("/").pop() ?? null,
    tenantName: invoice.tenant.name,
  });
}
