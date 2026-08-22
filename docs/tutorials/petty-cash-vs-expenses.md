# Tutorial shot list — `petty-cash-vs-expenses`

**Target length:** 3:00 (180 s)
**Audience:** A manager who runs a cash float and keeps recording spending straight into petty cash — then wonders why the P&L looks light.
**Job-to-be-done:** Learn the rule (spending lives on the Expenses page; petty cash is only the float ledger) by making the classic mistake on purpose and watching the app catch it.

## Prerequisite demo state

- **Al Seef Residences** org with a petty-cash float already topped up (one `IN` entry, e.g. 500) so the balance is positive.
- At least one **old unlinked OUT entry** seeded so the "unaccounted cash out" banner is visible from the start of the page.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:15 | `/petty-cash` | Land on Petty Cash; point at the balance card | Petty cash is your cash float. In goes the top-up, out go the small payments. |
| 0:15–0:30 | `/petty-cash` | Click "Add Entry"; switch Type to "Cash Out" — the amber nudge appears | Here's the mistake everyone makes. Watch what happens when I record spending as a cash out… |
| 0:30–0:50 | `/petty-cash` | Hover the nudge text | The app stops me: a petty-cash OUT never reaches your P&L. Spending belongs on the Expenses page. |
| 0:50–1:10 | `/petty-cash` | Click "Record as expense instead →" | So take the exit it offers: Record as expense instead. |
| 1:10–1:35 | `/expenses?prefill=petty` | The expense form opens pre-filled; point at the "Paid from petty cash" toggle; save | Same purchase, right place — with "Paid from petty cash" ticked, the OUT row is created *for* me, linked. |
| 1:35–1:50 | `/petty-cash` | Back on Petty Cash; the new OUT row wears a "From expense" badge | Back in the ledger: there's the cash out, badged "From expense". Books and float both correct. |
| 1:50–2:10 | `/petty-cash` | Point at the amber "unaccounted cash out" banner; click "Show these entries" | Old mistakes don't hide. This banner totals every cash out that never became an expense. |
| 2:10–2:35 | `/petty-cash` | On an unlinked OUT row, click "Not in P&L — convert"; confirm with "Create expense" in the modal | Each one has a one-click repair: Convert to expense. It creates the paid expense and links it — no doubles. |
| 2:35–2:50 | `/petty-cash` | Banner total shrinks / disappears | Banner's gone. Every shilling of cash out now shows up in your P&L. |
| 2:50–3:00 | `/petty-cash` | Hold on the ledger | Rule of thumb: money *moving* lives here; money *spent* lives on Expenses. |

## Wrong-way-first beat

The entire opening (0:15–0:50) is the wrong way, performed deliberately: starting a manual OUT for spending and letting the nudge interrupt. This is the core teaching device of the video.

## Closing line

"Next: cases and approvals — how maintenance stops living in WhatsApp."
