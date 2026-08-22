# Tutorial shot list — `invoice-income-link`

**Target length:** 3:00 (180 s)
**Audience:** A manager who bills tenants with invoices and is unsure whether to also record the payment as income (or has double-counted before).
**Job-to-be-done:** Understand that invoices and income entries are linked — one action updates both sides — and learn the safe reversal.

## Prerequisite demo state

- **Al Seef Residences** demo org with the current month's invoices generated (Invoices → "Generate invoices" bulk action, or seeded directly): at least 3 invoices in `SENT` status and 1 already `PAID`.
- At least one tenant with no income entry recorded this month (so the income-side flow has an open invoice to close).

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:15 | `/invoices` | Land on Invoices; sweep the stats cards (Total / Paid / Overdue / Outstanding) | Invoices are the bill. The money itself lives on the Income page. They're linked. |
| 0:15–0:35 | `/invoices` | Open a SENT invoice row's status dropdown; click "Mark paid" | Rent arrived? Mark the invoice paid… |
| 0:35–0:50 | `/income` | Navigate to Income; the new income entry is in the list | …and the income entry writes itself. Same amount, same tenant, same month. |
| 0:50–1:10 | `/income` | Click "Add Entry"; pick a tenant with an open invoice; enter rent; save | It works the other way too. Record the payment as income first… |
| 1:10–1:25 | `/invoices` | Back to Invoices; that tenant's invoice now shows PAID | …and the open invoice for that month flips to paid on its own. |
| 1:25–1:35 | `/invoices` | Hold on the paid rows | One action, both sides. Enter it twice and you'd be double-counting — so don't. |
| 1:35–1:55 | `/invoices` | Tick 3 checkboxes; the bulk bar appears; hover "Email to tenants" and "Mark paid" | Month-end: select many invoices at once. Email every PDF, or mark them all paid. |
| 1:55–2:15 | `/invoices` | Click bulk "Mark paid", confirm in the dialog | Each one gets its income entry, exactly like the single click. |
| 2:15–2:35 | `/invoices` | Open a PAID invoice's status dropdown — only "Revert to unpaid…" is offered | Mistakes happen. On a paid invoice there's exactly one way back: Revert to unpaid. |
| 2:35–2:50 | `/invoices` | Click "Revert to unpaid…", confirm | It reopens the invoice *and* deletes the linked income entry — books stay clean. |
| 2:50–3:00 | `/invoices` | Hold on the invoice list | Bill with invoices, receive with income, and let the link do the bookkeeping. |

## Wrong-way-first beat

Implicit at 1:25 — the narration names the double-entry mistake ("enter it twice and you'd be double-counting") at the exact moment both sides are visible, rather than performing the corruption on screen.

## Closing line

"Next: what happens when the tenant says 'I've paid' — verifying proof of payment."
