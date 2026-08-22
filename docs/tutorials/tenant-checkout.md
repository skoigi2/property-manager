# Tutorial shot list — `tenant-checkout`

**Target length:** 3:30 (210 s)
**Audience:** A manager doing move-outs on paper forms, unsure how the deposit maths and the paperwork come together.
**Job-to-be-done:** Run a complete tenant checkout — condition, rent balance, itemised deductions, live refund calculation — and finalise it into a signature-ready PDF with the tenancy closed out correctly.

## Prerequisite demo state

Seeded by `seed-state.ts`:

- **Al Seef Residences** org; one active tenant with a recorded deposit (a `DEPOSIT` income entry, so the deposit shows as verified) and **one unpaid invoice** (so the outstanding-rent line has a real number).
- No existing `CheckoutProcess` for that tenant (the video starts the checkout fresh).

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:15 | `/tenants/[id]` | Tenant detail page; click the "Checkout" button in the header | When a tenant gives notice, start here: the Checkout button on their page. |
| 0:15–0:35 | `/tenants/[id]/checkout` | The form loads; sweep the sections and the sticky settlement box on the right | One page replaces the paper form — and the box on the right is the live refund maths. |
| 0:35–0:55 | `/tenants/[id]/checkout` | Point at the deposit figure and the pre-filled outstanding rent balance | The deposit held and any unpaid rent are pulled in automatically. No hunting through ledgers. |
| 0:55–1:20 | `/tenants/[id]/checkout` | Record the condition section; toggle damage found | Walk the unit, record what you find. Damage here will become a deduction in a moment. |
| 1:20–1:50 | `/tenants/[id]/checkout` | Add an itemised deduction ("Repaint scuffed wall — 3,000"); watch the settlement box recalc | Add each deduction with its own line and amount — and watch the refund update live. |
| 1:50–2:10 | `/tenants/[id]/checkout` | Add a second deduction; settlement box updates again | Itemised beats a lump sum: the tenant can see exactly how the number was reached. |
| 2:10–2:30 | `/tenants/[id]/checkout` | Fill keys returned and utility transfer fields; pick the refund method | Keys, utility handover, and how the refund goes out — all on the record. |
| 2:30–2:45 | `/tenants/[id]/checkout` | Click Save (checkout stays IN_PROGRESS) | Save as you go. Nothing is final yet — the checkout stays in progress. |
| 2:45–3:05 | `/tenants/[id]/checkout` | Click Finalize; confirm | Finalising does the close-out in one stroke: tenant vacated, unit vacant, deposit settled. |
| 3:05–3:20 | `/tenants/[id]/checkout` | The PDF opens in a new tab; show the dual signature blocks | Out comes the statement PDF, ready for both signatures. |
| 3:20–3:30 | `/tenants/[id]/checkout` | Back on the page — now read-only with a Download PDF link | The record locks read-only. The goodbye is clean, documented, and defensible. |

## Wrong-way-first beat

Not applicable — the risk this flow addresses (undocumented lump-sum deposit deductions) is named in narration at 1:50 rather than performed.

## Closing line

"That's the full loop — from first tenant to final refund. Browse the rest any time under Settings → Tutorials."
