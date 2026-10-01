# Tutorial shot list — `rent-increases`

**Target length:** 1:20 (80 s)
**Audience:** A property manager whose leases carry a rent review clause (e.g. 5% a year) and who wants every increase applied on time, with proper notice.
**Job-to-be-done:** Act on the review reminder, schedule the increase, send the notice — and know where the lease's terms are set.

## Prerequisite demo state

Recorded in the **utilities** tutorial's account and org — `guide-utilities@groundworkpm.com` / "Nairobi Homes Management" (KES). `seed-rent-increases.ts` runs the utilities seed (a fresh **Kilimani Court** demo), then:

- sets the property's rent increase notice to 90 days;
- gives the unit **102** tenant (Grace & Daniel Kamau, KSh 85,000) terms of **5% a year**, first review on the 1st of the month whose notice deadline is 1–30 days away (so the review is *upcoming*), lease end two years after it;
- writes the `RENT_INCREASE_DUE` reminder the daily cron would raise (same fields as `checkRentIncreasesDue`), so the Inbox scene doesn't wait for the cron.

The notice is **never emailed on camera** — the demo tenant's address may be real. The Notice / Email buttons are only pointed at.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:06 | `/inbox` | Hover **Rent increase due — Grace & Daniel Kamau** | A lease with a rent review clause reminds you in the Inbox a month before the notice deadline. |
| 0:06–0:12 | same | Hold on the row | It shows the review date, today's rent and the new one, and when the notice must go out. |
| 0:12–0:18 | `/tenants/<unit 102>?tab=history` | **Review increase**; hover **Rent review** | Review increase opens the tenant's rent review: the lease's terms, the next review, and the deadline for notice. |
| 0:18–0:24 | same | Hover **New monthly rent** | The new rent is worked out from the lease — 5% a year here — and you can adjust it. |
| 0:24–0:31 | same | Hover **Effective from** | It starts on the review date. If the deadline has already passed, it moves to the first month with full notice — never backdated. |
| 0:31–0:38 | same | **Schedule increase**; hover the **Scheduled** badge | Scheduled. Invoices from that month bill the new rent, and the tenant's rent switches by itself on the day. |
| 0:38–0:45 | same | Hover **Notice** (Email notice beside it) | Download the notice letter to print, or email it — the PDF goes with it and the email is logged on the tenant's Comms tab. |
| 0:45–0:52 | same | **Edit** → hover **Rent Increase**; close | The terms are set on the tenant: a percentage or a fixed amount, how often, the first review and the notice period. |
| 0:52–0:57 | same | Hold on the card | Skipping a review? Record no increase, and the next reminder is for the following year. |
| 0:57–1:01 | same | Hold | That's rent increases: reminded, scheduled, notified — and never missed. |

Slow dev-server waits (opening the tenant, scheduling) are cut with `offCamera`.

## Wrong-way-first beat

None — this is a flow tutorial.

## Closing line

"That's rent increases: reminded, scheduled, notified — and never missed."
