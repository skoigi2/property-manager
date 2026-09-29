import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";
import { loadRentIncreaseNotice } from "@/lib/rent-increase";
import { generateRentIncreaseNoticePdf } from "@/lib/rent-increase-notice-pdf";

export const maxDuration = 30;

// Email the rent increase notice to the tenant (letter in the body + PDF
// attached), log it on the tenant's Comms tab and stamp noticeSentAt.
export async function POST(_req: Request, { params }: { params: { id: string; historyId: string } }) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;
  const data = await loadRentIncreaseNotice(params.id, params.historyId);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(data.tenant.unit.propertyId);
  if (!access.ok) return access.error!;

  const to = data.tenant.email?.trim();
  if (!to) {
    return Response.json(
      { error: "This tenant has no email address — download the notice and deliver it by hand." },
      { status: 400 },
    );
  }

  const { notice } = data;
  const html =
    `<p><strong>${esc(notice.title)}</strong></p>` +
    notice.paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("") +
    `<p>${notice.signOff.map(esc).join("<br/>")}</p>` +
    `<p style="color:#6b7280;font-size:12px">The letter is attached as a PDF.</p>`;
  const pdf = await generateRentIncreaseNoticePdf(data.pdfInput);

  try {
    await sendNotificationEmail(to, notice.subject, html, {
      organizationId: data.tenant.unit.property.organizationId,
      userId: session!.user.id,
      attachments: [{ filename: `Rent increase notice - Unit ${data.tenant.unit.unitNumber}.pdf`, content: pdf }],
    });
  } catch (e) {
    return Response.json({ error: `Email failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.rentHistory.update({ where: { id: data.row.id }, data: { noticeSentAt: now } }),
    prisma.communicationLog.create({
      data: {
        tenantId: data.tenant.id,
        type: "EMAIL",
        subject: notice.subject,
        body: notice.paragraphs.slice(1, 3).join("\n\n"),
        templateUsed: "RENT_INCREASE_NOTICE",
        loggedByEmail: session!.user.email ?? "system",
        loggedByName: session!.user.name ?? null,
        sentAt: now,
      },
    }),
  ]);
  return Response.json({ ok: true, sentTo: to, noticeSentAt: now });
}
