import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { sendNotificationEmail, esc } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redactToken } from "@/lib/approval-auth";

const TOKEN_TTL_DAYS = 14;

/**
 * POST /api/maintenance/[id]/vendor-link — mint (or rotate) the vendor magic
 * link for a job with an assigned vendor. Emails the vendor when an address
 * exists; always returns the URL for WhatsApp/SMS sharing.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await prisma.maintenanceJob.findUnique({
    where: { id: params.id },
    include: {
      vendor: { select: { name: true, email: true } },
      unit: { select: { unitNumber: true } },
      property: { select: { name: true, organizationId: true, organization: { select: { name: true } } } },
    },
  });
  if (!job || !propertyIds.includes(job.propertyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!job.vendorId || !job.vendor) {
    return NextResponse.json({ error: "Assign a vendor to this job first." }, { status: 400 });
  }
  if (job.status === "DONE" || job.status === "CANCELLED") {
    return NextResponse.json({ error: "This job is closed." }, { status: 400 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
  await prisma.maintenanceJob.update({
    where: { id: job.id },
    data: { vendorLinkToken: token, vendorLinkExpiresAt: expiresAt },
  });

  const origin = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  const url = `${origin}/vendor/${token}`;

  let emailed = false;
  const vendorEmail = job.vendor.email?.trim();
  if (vendorEmail) {
    const senderName = job.property.organization?.name ?? job.property.name;
    try {
      await sendNotificationEmail(
        vendorEmail,
        `Quote request — ${job.title} (${job.property.name})`,
        `
          <p>Dear ${esc(job.vendor.name)},</p>
          <p>${esc(senderName)} has requested a quote for the following job:</p>
          <p><strong>${esc(job.title)}</strong><br/>
          ${esc(job.property.name)}${job.unit ? ` — Unit ${esc(job.unit.unitNumber)}` : ""}</p>
          ${job.description ? `<p>${esc(job.description)}</p>` : ""}
          <p>Submit your quote (and your available date) here — no login needed:</p>
          <p><a href="${url}">${url}</a></p>
          <p>This link expires in ${TOKEN_TTL_DAYS} days.</p>
        `,
        { organizationId: job.property.organizationId ?? null, caseThreadId: job.caseThreadId ?? null },
      );
      emailed = true;
    } catch {
      // Fall through — manager still gets the URL.
    }
  }

  if (job.caseThreadId) {
    await prisma.caseEvent.create({
      data: {
        caseThreadId: job.caseThreadId,
        kind: "COMMENT",
        actorName: session!.user.name ?? session!.user.email ?? "manager",
        body: `Quote link sent to ${job.vendor.name}${emailed ? ` (${vendorEmail})` : " (shared manually)"} — expires ${expiresAt.toLocaleDateString("en-GB")}.`,
      },
    }).catch(() => {});
  }

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email ?? "unknown",
    action:     "UPDATE",
    resource:   "MaintenanceJob",
    resourceId: job.id,
    after:      { vendorLinkRequested: true, vendor: job.vendor.name, token: redactToken(token), expiresAt },
  });

  return NextResponse.json({ url, emailed, expiresAt });
}
