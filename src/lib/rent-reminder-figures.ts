/**
 * Outstanding amount and days overdue for a rent reminder — the one place
 * they are worked out, shared by the reminder email (src/lib/rent-reminder.ts,
 * Inbox "Send reminders" + the dunning cron) and the WhatsApp reminder
 * (src/lib/whatsapp-messages.ts), so the two never disagree. Client-safe.
 */
export interface ReminderInvoiceFigures {
  totalAmount: number;
  paidAmount: number | null;
  dueDate: Date | string;
}

const MS_PER_DAY = 86_400_000;

/** One invoice: what is still unpaid, and how many whole days past the due date it is. */
export function invoiceReminderFigures(inv: ReminderInvoiceFigures, now: Date = new Date()) {
  const outstanding = Math.round((inv.totalAmount - (inv.paidAmount ?? 0)) * 100) / 100;
  const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / MS_PER_DAY));
  return { outstanding, daysOverdue };
}

/**
 * Several open invoices of one tenant (a reminder not tied to one invoice):
 * the outstanding amounts add up, and days overdue is that of the oldest
 * unpaid invoice — each figured exactly as the per-invoice reminder does.
 */
export function tenantReminderFigures(invoices: ReminderInvoiceFigures[], now: Date = new Date()) {
  let outstanding = 0;
  let daysOverdue = 0;
  for (const inv of invoices) {
    const f = invoiceReminderFigures(inv, now);
    if (f.outstanding <= 0) continue;
    outstanding += f.outstanding;
    daysOverdue = Math.max(daysOverdue, f.daysOverdue);
  }
  return { outstanding: Math.round(outstanding * 100) / 100, daysOverdue };
}
