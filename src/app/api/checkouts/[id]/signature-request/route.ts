import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { sendNotificationEmail, esc } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";

const TOKEN_TTL_DAYS = 14;

/**
 * POST /api/checkouts/[id]/signature-request — mint (or re-mint) the tenant
 * e-sign magic link for a finalized checkout and email it to the tenant when
 * an address exists. Always returns the URL so the manager can share it via
 * WhatsApp/SMS regardless. Re-requesting rotates the token (old link dies).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkout = await prisma.checkoutProcess.findUnique({
    where: { id: params.id },
    include: {
      tenant: { select: { name: true, email: true } },
      unit: { select: { unitNumber: true } },
      property: { select: { name: true, organizationId: true, organization: { select: { name: true } } } },
    },
  });
  if (!checkout || !propertyIds.includes(checkout.propertyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (checkout.status !== "COMPLETED") {
    return NextResponse.json({ error: "Finalize the checkout before requesting a sign-off." }, { status: 400 });
  }
  if (checkout.tenantSignedAt) {
    return NextResponse.json({ error: "The tenant has already acknowledged this checkout." }, { status: 409 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
  await prisma.checkoutProcess.update({
    where: { id: checkout.id },
    data: {
      signatureToken: token,
      signatureTokenExpiresAt: expiresAt,
      signatureRequestedAt: new Date(),
    },
  });

  const origin = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  const url = `${origin}/sign/checkout/${token}`;

  let emailed = false;
  const tenantEmail = checkout.tenant.email?.trim();
  if (tenantEmail) {
    const senderName = checkout.property.organization?.name ?? checkout.property.name;
    try {
      await sendNotificationEmail(
        tenantEmail,
        `Please confirm your check-out — ${checkout.property.name}, Unit ${checkout.unit.unitNumber}`,
        `
          <p>Dear ${esc(checkout.tenant.name)},</p>
          <p>Your check-out from Unit ${esc(checkout.unit.unitNumber)}, ${esc(checkout.property.name)} has been
          completed. Please review the settlement summary and acknowledge it by typing your name — no login needed:</p>
          <p><a href="${url}">${url}</a></p>
          <p>This link expires in ${TOKEN_TTL_DAYS} days.</p>
          <p>Kind regards,<br/>${esc(senderName)}</p>
        `,
        { organizationId: checkout.property.organizationId ?? null },
      );
      emailed = true;
    } catch {
      // Fall through — the manager still gets the link to share manually.
    }
  }

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email ?? "unknown",
    action:     "UPDATE",
    resource:   "CheckoutProcess",
    resourceId: checkout.id,
    after:      { signatureRequested: true, token: redactToken(token), expiresAt },
  });

  return NextResponse.json({ url, emailed, expiresAt });
}
