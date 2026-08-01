import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendNotificationEmail, esc } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";

// Public token routes (middleware excludes /api wholesale) — the token IS the
// auth, mirroring /api/approvals/[token]. GET stays idempotent so email
// link-preview scanners can't consume anything.

function isExpired(d: Date | null): boolean {
  return !!d && d.getTime() < Date.now();
}

async function findByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.checkoutProcess.findUnique({
    where: { signatureToken: token },
    include: {
      deductions: { select: { description: true, amount: true } },
      tenant: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      property: { select: { id: true, name: true, currency: true, organizationId: true, organization: { select: { name: true } } } },
    },
  });
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const checkout = await findByToken(params.token);
  if (!checkout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    expired: isExpired(checkout.signatureTokenExpiresAt) && !checkout.tenantSignedAt,
    signed: !!checkout.tenantSignedAt,
    signedName: checkout.tenantSignedName,
    signedAt: checkout.tenantSignedAt,
    tenantName: checkout.tenant.name,
    propertyName: checkout.property.name,
    orgName: checkout.property.organization?.name ?? checkout.property.name,
    unitNumber: checkout.unit.unitNumber,
    currency: checkout.property.currency,
    checkOutDate: checkout.checkOutDate,
    originalDeposit: checkout.originalDeposit,
    depositReceived: checkout.depositReceived,
    rentBalanceOwing: checkout.rentBalanceOwing,
    deductions: checkout.deductions,
    totalDeductions: checkout.totalDeductions,
    balanceToRefund: checkout.balanceToRefund,
  });
}

const signSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const limited = rateLimit(`sign-checkout:${getClientIp(req)}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const checkout = await findByToken(params.token);
  if (!checkout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (checkout.tenantSignedAt) {
    return NextResponse.json({ error: "Already acknowledged." }, { status: 409 });
  }
  if (isExpired(checkout.signatureTokenExpiresAt)) {
    return NextResponse.json({ error: "This link has expired. Ask your manager to send a new one." }, { status: 410 });
  }

  const parsed = signSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please type your full name." }, { status: 400 });
  }

  const now = new Date();
  await prisma.checkoutProcess.update({
    where: { id: checkout.id },
    data: { tenantSignedName: parsed.data.name, tenantSignedAt: now },
  });

  await logAudit({
    userId:     "system",
    userEmail:  "tenant-esign",
    action:     "UPDATE",
    resource:   "CheckoutProcess",
    resourceId: checkout.id,
    after:      { tenantSignedName: parsed.data.name, tenantSignedAt: now, token: redactToken(params.token) },
  });

  // Tell the managers — the settlement is now acknowledged end-to-end.
  const orgId = checkout.property.organizationId;
  if (orgId) {
    const { getPropertyManagers } = await import("@/lib/notifications/checkers");
    const managers = await getPropertyManagers(checkout.property.id, orgId).catch(() => []);
    for (const m of managers) {
      sendNotificationEmail(
        m.email,
        `Checkout acknowledged — ${checkout.tenant.name}, Unit ${checkout.unit.unitNumber}`,
        `
          <p>${esc(parsed.data.name)} has electronically acknowledged the check-out settlement for
          Unit ${esc(checkout.unit.unitNumber)}, ${esc(checkout.property.name)}.</p>
          <p>The signed name and timestamp now appear on the checkout PDF.</p>
        `,
        { organizationId: orgId },
      ).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, signedAt: now });
}
