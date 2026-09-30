import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { authorizeBudget } from "@/lib/service-charge-access";
import { buildServiceChargeView } from "@/lib/service-charge-data";
import { generateServiceChargePdf } from "@/lib/service-charge-statement-pdf";

export const maxDuration = 60;

// Email each selected tenant their service charge statement (PDF attached),
// logged on their Comms tab. Tenants without an email come back as failures.
const bodySchema = z.object({ tenantIds: z.array(z.string()).min(1).max(200) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick the tenants to email" }, { status: 400 });

  const view = await buildServiceChargeView(auth.budget);
  const fmt = (n: number) => formatCurrency(n, view.property.currency);
  const sender = view.orgName ?? view.property.name;
  const sent: string[] = [];
  const failed: { tenantName: string; reason: string }[] = [];

  for (const tenantId of parsed.data.tenantIds) {
    const row = view.statement.rows.find((r) => r.tenantId === tenantId);
    if (!row) continue;
    const to = row.email?.trim();
    if (!to) {
      failed.push({ tenantName: row.tenantName, reason: "No email address" });
      continue;
    }
    const subject = `Service charge statement ${view.period.label} — Unit ${row.unitNumber}, ${view.property.name}`;
    const outcome =
      row.balance > 0.005
        ? `a balancing charge of <strong>${esc(fmt(row.balance))}</strong> is due`
        : row.balance < -0.005
          ? `you are in credit by <strong>${esc(fmt(-row.balance))}</strong>`
          : "there is nothing further to pay";
    const html =
      `<p>Dear ${esc(row.tenantName)},</p>` +
      `<p>Please find attached the service charge statement for ${esc(view.property.name)}, ${esc(view.period.label)}` +
      `${view.statement.yearEnded ? "" : " (interim — to date)"}.</p>` +
      `<p>Your share of the building's costs is ${esc(fmt(row.share))}; the service charge billed was ${esc(fmt(row.billed))}, so ${outcome}.</p>` +
      `<p>If you have any questions about the statement, please contact us.</p>` +
      `<p>Kind regards,<br/>${esc(sender)}</p>`;
    try {
      const pdf = await generateServiceChargePdf({ view, tenantId });
      await sendNotificationEmail(to, subject, html, {
        organizationId: auth.budget.organizationId,
        userId: auth.session.user.id,
        attachments: [{ filename: `Service charge statement ${view.period.label} - Unit ${row.unitNumber}.pdf`.replace(/[^\w .-]/g, ""), content: pdf }],
      });
      await prisma.communicationLog.create({
        data: {
          tenantId,
          type: "EMAIL",
          subject,
          body: `Service charge statement ${view.period.label} emailed to ${to}: share ${fmt(row.share)}, billed ${fmt(row.billed)}, balance ${fmt(row.balance)}.`,
          templateUsed: "SERVICE_CHARGE_STATEMENT",
          loggedByEmail: auth.session.user.email ?? "system",
          loggedByName: auth.session.user.name ?? null,
          sentAt: new Date(),
        },
      });
      sent.push(row.tenantName);
    } catch (e) {
      failed.push({ tenantName: row.tenantName, reason: e instanceof Error ? e.message : "Send failed" });
    }
  }
  return Response.json({ sent, failed });
}
