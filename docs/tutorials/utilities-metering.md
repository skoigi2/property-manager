# Tutorial shot list — `utilities-metering`

**Target length:** 3:20 (200 s)
**Audience:** A property manager (and their caretaker) who bills tenants for water and electricity from monthly meter readings — including properties on a KPLC bulk meter with private check meters per unit.
**Job-to-be-done:** Get a month's readings in (typed, or imported from a sheet), approve and bill them with the rent, chase who hasn't paid, and see where the money went.

## Prerequisite demo state

Recorded in its **own** account and org — `guide-utilities@groundworkpm.com` / "Nairobi Homes Management" (KES) — so the shared guide org stays single-property in GBP. `seed-utilities.ts` creates the account on first run, then **every run** deletes and re-seeds the org's **Kilimani Court** demo through `POST /api/demo/seed`, which carries:

- water + electricity meters on all 10 units, the KPLC bulk meter and a common-area meter, tariffs;
- three months of readings billed on the rent invoices, a paid / part-paid / unpaid mix;
- last month's readings for two units left **Submitted** for the Review scene — one a flagged spike (their rent is paid, so billing raises separate utilities invoices);
- council, KPLC and generator expenses for the Reconciliation scene;
- **this month unread** — the Readings scene enters it.

It also writes `fixtures/utilities-readings.xlsx`: this month's sheet in walking order, filled in for every meter except the first three (typed on camera).

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:10 | `/utilities?tab=readings` | Land on this month's Readings, nothing read yet | At month end every water and electricity meter gets read. Here's this month — nothing read yet. |
| 0:10–0:20 | same | Click **By unit** | Group by unit to follow the caretaker's walk: each door's water and power together, the KPLC bulk meter last. |
| 0:20–0:40 | same | Type three readings, pressing Enter after each | At a desk it's a table: type the reading, press Enter, and you're on the next meter. Usage appears as you type. |
| 0:40–0:50 | same | Click **Save 3 readings** | Save them in one go. On a phone, the caretaker gets cards with a camera button for a photo of each dial. |
| 0:50–1:00 | same | Hover **Download sheet** | Readings on paper? Download sheet gives this month's meters in walking order, with last month's numbers. |
| 1:00–1:20 | same | **Import readings**, upload the filled sheet — preview appears | Fill in the Current reading column and import it. Every row is matched to its meter and previewed first. |
| 1:20–1:30 | same | Click **Import 19 readings**, then **Done** | Imported readings arrive as Submitted, waiting for a manager's approval. |
| 1:30–1:45 | `Review & bill`, previous month | Switch tab and month; move to the two readings awaiting approval | On Review & bill the manager checks last month's readings, and any photos, before approving them. |
| 1:40–1:45 | same | Hover the spike flag on the second unit's electricity | Unusual jumps are flagged — worth a second look before you approve. |
| 1:45–1:55 | same | **Select all** → **Approve** | Approving fixes the rate and the charge for each reading. |
| 1:55–2:10 | same | **Bill onto …**; point at the new invoice number on the billed row | Then bill: readings go onto next month's rent invoice — or a separate utilities invoice if that one's already paid. |
| 2:10–2:30 | `Paid & unpaid` | Land on the statement; hover **Select everyone owing** | Paid & unpaid is the chase list: per tenant, water and electricity billed, paid and still owing. Tick who owes and email reminders — or export to Excel or PDF. |
| 2:30–2:50 | `Reconciliation` | Hover **Surplus to owner**, then the electricity meter table | Reconciliation shows where the money goes. Water: what tenants paid against the council bill — the borehole surplus goes to the owner. Power: the KPLC bulk meter against units billed, vacant units and common areas, so losses show up. |
| 2:50–3:00 | same | Hold | Tenants see their readings and what they owe in their portal, so nobody has to call to ask. |

## Wrong-way-first beat

None — this is a flow tutorial. Review & bill is the "check before you approve" moment.

## Closing line

"That's metering: read, approve, bill, chase."
