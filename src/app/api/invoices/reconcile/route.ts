export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";

/**
 * POST /api/invoices/reconcile — statement-matching PREVIEW (read-only).
 *
 * Takes parsed statement lines (date, amount, description, reference) and
 * fuzzy-matches each against the caller's open invoices:
 *   - amount vs the invoice's outstanding balance (exact beats partial)
 *   - tenant-name token overlap with the line description/reference
 *   - invoice number appearing in the line
 * Returns ranked candidates per line plus an auto-selection where the match
 * is unambiguous. Nothing is written — /api/invoices/reconcile/confirm applies.
 */

const lineSchema = z.object({
  id: z.number().int(),
  date: z.string().optional().nullable(),
  amount: z.number().positive(),
  description: z.string().max(400).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
});

const previewSchema = z.object({
  lines: z.array(lineSchema).min(1).max(200),
});

interface Candidate {
  invoiceId: string;
  invoiceNumber: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  currency: string;
  outstanding: number;
  totalAmount: number;
  score: number;
  exactAmount: boolean;
}

const tokenize = (s: string | null | undefined): string[] =>
  (s ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = previewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid statement lines" }, { status: 400 });
  }

  const openInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["DRAFT", "SENT", "OVERDUE"] },
      tenant: { unit: { propertyId: { in: propertyIds } } },
    },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      periodYear: true,
      periodMonth: true,
      tenant: {
        select: {
          name: true,
          unit: { select: { unitNumber: true, property: { select: { name: true, currency: true } } } },
        },
      },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 1000,
  });

  const invoiceMeta = openInvoices.map((inv) => ({
    inv,
    outstanding: Math.max(0, inv.totalAmount - (inv.paidAmount ?? 0)),
    nameTokens: tokenize(inv.tenant.name),
    numberLower: inv.invoiceNumber.toLowerCase(),
    unitLower: inv.tenant.unit.unitNumber.toLowerCase(),
  }));

  const results = parsed.data.lines.map((line) => {
    const lineText = `${line.description ?? ""} ${line.reference ?? ""}`.toLowerCase();
    const lineTokens = tokenize(lineText);

    const candidates: Candidate[] = [];
    for (const m of invoiceMeta) {
      if (m.outstanding <= 0) continue;

      let score = 0;
      const exactAmount = Math.abs(m.outstanding - line.amount) < 0.01;
      const exactTotal = Math.abs(m.inv.totalAmount - line.amount) < 0.01;
      if (exactAmount) score += 50;
      else if (exactTotal) score += 40;
      else if (line.amount < m.outstanding) score += 8; // plausible partial
      else continue; // overpayment of this invoice — not a candidate

      if (lineText.includes(m.numberLower)) score += 60;
      for (const t of m.nameTokens) if (lineTokens.includes(t)) score += 15;
      if (m.unitLower.length >= 2 && lineTokens.includes(m.unitLower)) score += 8;

      if (score <= 8 && !exactAmount && !exactTotal) continue; // partial with no evidence

      candidates.push({
        invoiceId: m.inv.id,
        invoiceNumber: m.inv.invoiceNumber,
        tenantName: m.inv.tenant.name,
        unitNumber: m.inv.tenant.unit.unitNumber,
        propertyName: m.inv.tenant.unit.property.name,
        currency: m.inv.tenant.unit.property.currency ?? "USD",
        outstanding: m.outstanding,
        totalAmount: m.inv.totalAmount,
        score,
        exactAmount,
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    const top5 = candidates.slice(0, 5);

    // Auto-select only when clearly unambiguous.
    const [first, second] = top5;
    const autoSelect =
      first && first.score >= 50 && (!second || first.score - second.score >= 15)
        ? first.invoiceId
        : null;

    return { id: line.id, candidates: top5, autoSelect };
  });

  return NextResponse.json({ results });
}
