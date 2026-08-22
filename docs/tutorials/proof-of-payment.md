# Tutorial shot list — `proof-of-payment`

**Target length:** 3:00 (180 s)
**Audience:** A manager whose tenants send M-Pesa screenshots on WhatsApp, wondering how the portal replaces that.
**Job-to-be-done:** See the full proof-of-payment loop: tenant submits from the portal, invoice waits in PENDING_VERIFICATION, manager approves from the drawer.

## Prerequisite demo state

Seeded by `seed-state.ts`:

- **Al Seef Residences** org; one tenant with a valid `portalToken` and a `SENT` invoice for the current month.
- One *other* invoice already in `PENDING_VERIFICATION` with a **file proof** attached (submitted via `POST /api/portal/[token]/invoices/[invoiceId]/proof` with a sample M-Pesa screenshot PNG), so the manager side has something to open even if the live portal beat is cut.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:12 | `/portal/[token]` | Open the tenant portal (tenant's view); tap the Balance tab | This is what your tenant sees — their portal link, no login needed. |
| 0:12–0:30 | `/portal/[token]` | On the outstanding invoice, tap "I've paid this"; the bottom sheet opens | They've paid by bank or M-Pesa. Instead of WhatsApping you, they tap "I've paid this". |
| 0:30–0:50 | `/portal/[token]` | Attach the screenshot file AND paste confirmation text; submit | A screenshot, the confirmation text, or both. Twenty seconds of their time. |
| 0:50–1:05 | `/portal/[token]` | Confirmation state on the sheet | Submitted. Nothing has touched your books yet — that's the point. |
| 1:05–1:25 | `/tenants/[id]` (Invoices tab) | Switch to the manager view; the invoice shows the amber "Check Proof" badge | On your side, the invoice now wears an amber badge: Check Proof. It's waiting on you. |
| 1:25–1:45 | `/tenants/[id]` | Click the badge; ProofVerifyDrawer slides in with the image previewed inline | Click it and the proof is right there — previewed inline, nothing to download. |
| 1:45–2:05 | `/tenants/[id]` (drawer) | Point at the pasted text panel; click the copy control | Text proof sits alongside, copy-ready if you want to check the reference in your bank app. |
| 2:05–2:25 | `/tenants/[id]` (drawer) | Check the paid-amount field; pick the payment method; click "Mark as Paid" | Confirm the amount and method, then Approve. |
| 2:25–2:45 | `/tenants/[id]` | Drawer closes; invoice now PAID | One click did three things: invoice paid, income entry created, and the proof filed in the tenant's documents. |
| 2:45–3:00 | `/tenants/[id]` | Hold on the invoices list | If the proof doesn't add up, Reject sends the invoice back to overdue — and nothing was booked. |

> Note: the "Check Proof" badge + verify drawer live on the **tenant detail page's Invoices tab**, not the global `/invoices` page.

## Wrong-way-first beat

Not performed on screen; the narration at 0:12 names the wrong way (screenshots arriving on WhatsApp, unfiled and unverifiable) as the thing this flow replaces.

## Closing line

"Next: where cash spending belongs — petty cash vs expenses."
