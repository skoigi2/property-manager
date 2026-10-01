# Tutorial shot list — `whatsapp-reminders`

**Target length:** 1:10 (70 s)
**Audience:** A property manager whose tenants don't read email but answer WhatsApp.
**Job-to-be-done:** Send an overdue tenant — or several — a rent reminder from their own WhatsApp, with the right amount and a portal link, and keep a record of it.

## Prerequisite demo state

Recorded in the **utilities** tutorial's account and org — `guide-utilities@groundworkpm.com` / "Nairobi Homes Management" (KES). `seed-whatsapp-reminders.ts` runs the utilities seed (a fresh **Kilimani Court** demo), whose Inbox has two overdue rent invoices — **Faith Chebet** (unit 103, a full month unpaid) and **Samuel Kiprono** (201, utilities unpaid). Then:

- Faith gets a valid **portal link**, so her reminder carries it; Samuel has none, so the bulk step offers *Create portal link & send*;
- **Brian Otieno** (G01) has his phone removed, for the greyed-out button beat.

`window.open` is stubbed for the whole recording: no WhatsApp chat ever opens (the demo's phone numbers may belong to real people). The toast "WhatsApp opened — logged as a send attempt" is what shows on screen.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:06 | `/inbox` | Hover Faith's overdue row → **WhatsApp** | Some tenants never read email. Send them a reminder from your own WhatsApp instead. |
| 0:06–0:13 | same | Click **WhatsApp**; the preview opens; hover the message | The reminder is written for you: what they owe, how many days overdue, and a link to their tenant portal. |
| 0:13–0:20 | same | **Send via WhatsApp**; the toast | Tap send and WhatsApp opens with the chat and message ready. You press send there — from your own number, nothing to set up. |
| 0:20–0:27 | same | Tick both overdue rows → **Remind on WhatsApp**; hover "Next: …" | Several tenants at once? Remind on WhatsApp takes you through them one chat at a time. |
| 0:27–0:36 | same | On the tenant without a portal link, hover then click **Create portal link & send**; the next tenant: **Send via WhatsApp**; **Done** | No portal link yet? Create one as you send — it's never made without you. |
| 0:36–0:45 | `/tenants/[Faith]?tab=comms` | Hover the first WhatsApp entry | Every message is logged on the tenant's Comms tab — as a send attempt, because WhatsApp can't tell us it was delivered. |
| 0:45–0:53 | `/tenants/[Brian]` | Header **WhatsApp**; hover the greyed-out button | No phone number, or no country code? The button stays grey until you add one. |
| 0:53–0:57 | same | Hold | That's WhatsApp reminders: written for you, sent from your own phone. |

Slow dev-server waits — the tenant pages and each modal loading its data — are cut with `offCamera`. The portal link in the message is shown on the production domain rather than localhost:3000 (display only).

## Wrong-way-first beat

None — this is a flow tutorial.

## Closing line

"That's WhatsApp reminders: written for you, sent from your own phone."
