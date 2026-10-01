# Tutorial shot list — `service-charge`

**Target length:** 1:35 (95 s)
**Audience:** A property manager running an apartment block whose tenants pay a monthly service charge for the shared costs.
**Job-to-be-done:** Set the year's service charge budget and the monthly charge that covers it, keep an eye on spending, and settle each tenant's share at year end.

## Prerequisite demo state

Recorded in the **utilities** tutorial's account and org — `guide-utilities@groundworkpm.com` / "Nairobi Homes Management" (KES). `seed-service-charge.ts` runs the utilities seed (a fresh **Kilimani Court** demo through `POST /api/demo/seed`), then:

- deletes the demo's own budget;
- creates a budget for the service charge year that **has just ended** — the 12 months to the end of last month (security, cleaning, garbage, Wi-Fi). It lines up with the demo's leases, which start a year back, so every tenant is in for the whole year and only the vacant unit **301** falls to the landlord;
- leaves the **current** year without a budget — the video creates it from last year's.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:06 | `/service-charge` (this year) | Land on the empty state | Service charge is budgeted one block and one year at a time. This year doesn't have a budget yet. |
| 0:06–0:12 | same | **Start from the … budget**; the costs appear | Start from last year's: the same costs come across, and so does the month the year starts. |
| 0:16–0:26 | Budget tab | **Add cost** → Elevator / Lift; type 120,000 and "Lift servicing contract" → **Save budget** | Add what's new this year — here, a lift servicing contract — and save. |
| 0:26–0:33 | same | Scroll to **Each unit's share** | The total is split by floor area: each unit's share of the budget, and the monthly charge that covers it. |
| 0:33–0:39 | same | Hover **Pays now** | Amber means the tenant pays less than their share today. |
| 0:39–0:48 | same | **Apply to tenants** → **Apply** | Apply to tenants sets everyone's monthly service charge to match, from their next invoice. |
| 0:48–0:59 | previous year → **Budget vs actual** | Hover **Variance** | Budget vs actual tracks what's been spent against the budget, cost by cost, all year. |
| 0:59–1:08 | **Year-end statement** | Hover the first tenant row | When the year ends, each tenant's share of what was actually spent is set against what they were billed. |
| 1:08–1:13 | same | Hover **Landlord (vacant)** | Days a unit stood empty are the owner's share. |
| 1:13–1:22 | same | Select all → **Raise balancing invoices**; hover the first new invoice number | Shortfalls become draft balancing invoices in one click. Credits are listed for you to refund. |
| 1:22–1:29 | same | **Publish to portal** | Publish, and each tenant downloads their own statement from the portal — or email it to them. |
| 1:29–1:32 | same | Hold | That's service charge: budget, track, settle. |

Slow dev-server saves (creating the budget, saving, Apply, raising invoices, Publish) are cut with `offCamera`.

## Wrong-way-first beat

None — this is a flow tutorial.

## Closing line

"That's service charge: budget, track, settle."
