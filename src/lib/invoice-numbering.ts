import { prisma } from "@/lib/prisma";

// Invoice numbering series.
//
// Each organisation has a default series (Organization.invoiceFormat +
// invoiceNextNumber). A payment account with its own invoiceFormat runs a
// SEPARATE series — so invoices issued under a different landlord company
// keep that company's unbroken numbering.
//
// Counters advance via atomic `increment` updates (safe under concurrency and
// pgBouncer — no interactive transaction needed). invoiceNumber is globally
// unique in the DB, so allocation retries with the next counter value on the
// rare collision (e.g. two orgs sharing a format, or migrated legacy numbers).

export const DEFAULT_INVOICE_FORMAT = "INV-{YYYYMM}-{SEQ}";

/**
 * Render a numbering format for a sequence + period date.
 * Tokens: {YYYY} {YY} {MM} {YYYYMM} {SEQ} (sequence, zero-padded to 4).
 * A format without {SEQ} gets "-{SEQ}" appended so numbers stay unique.
 */
export function formatInvoiceNumber(format: string, seq: number, periodDate: Date): string {
  const yyyy = String(periodDate.getFullYear());
  const mm = String(periodDate.getMonth() + 1).padStart(2, "0");
  const withSeq = format.includes("{SEQ}") ? format : `${format}-{SEQ}`;
  return withSeq
    .replaceAll("{YYYYMM}", `${yyyy}${mm}`)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{YY}", yyyy.slice(2))
    .replaceAll("{MM}", mm)
    .replaceAll("{SEQ}", String(seq).padStart(4, "0"));
}

/**
 * Allocate the next invoice number for a tenant's invoice. Resolves the
 * series through the same chain as payment details: unit account override →
 * property default account → organisation default. An account only runs its
 * own series when it has invoiceFormat set.
 */
export async function allocateInvoiceNumber(tenantId: string, periodDate: Date): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      unit: {
        select: {
          paymentAccountId: true,
          property: {
            select: {
              organizationId: true,
              agreement: { select: { paymentAccountId: true } },
            },
          },
        },
      },
    },
  });

  const orgId = tenant?.unit.property.organizationId ?? null;
  const accountId = tenant?.unit.paymentAccountId ?? tenant?.unit.property.agreement?.paymentAccountId ?? null;

  const account = accountId
    ? await prisma.paymentAccount.findUnique({
        where: { id: accountId },
        select: { id: true, invoiceFormat: true },
      })
    : null;
  const useAccountSeries = !!account?.invoiceFormat;

  let orgFormat: string | null = null;
  if (!useAccountSeries && orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { invoiceFormat: true },
    });
    orgFormat = org?.invoiceFormat ?? null;
  }

  // Legacy fallback: property without an organisation — keep the old
  // global-count behaviour rather than failing.
  if (!useAccountSeries && !orgId) {
    const count = await prisma.invoice.count();
    return formatInvoiceNumber(DEFAULT_INVOICE_FORMAT, count + 1, periodDate);
  }

  const format = useAccountSeries ? account!.invoiceFormat! : orgFormat ?? DEFAULT_INVOICE_FORMAT;

  // Atomically advance the counter; retry on the (rare) collision with an
  // existing number — each retry advances the counter again, so the series
  // simply skips past the conflict.
  for (let attempt = 0; attempt < 25; attempt++) {
    const after = useAccountSeries
      ? await prisma.paymentAccount.update({
          where: { id: account!.id },
          data: { invoiceNextNumber: { increment: 1 } },
          select: { invoiceNextNumber: true },
        })
      : await prisma.organization.update({
          where: { id: orgId! },
          data: { invoiceNextNumber: { increment: 1 } },
          select: { invoiceNextNumber: true },
        });
    const seq = after.invoiceNextNumber - 1;
    const candidate = formatInvoiceNumber(format, seq, periodDate);
    const clash = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate a unique invoice number — check the numbering series settings");
}
