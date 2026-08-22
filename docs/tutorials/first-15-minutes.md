# Tutorial shot list — `first-15-minutes`

**Target length:** 4:00 (240 s)
**Audience:** A manager who just created their organisation and is looking at a mostly-empty dashboard.
**Job-to-be-done:** Go from an empty property to a configured one — tenant on a lease, portal link shared, first money recorded — using the Setup Checklist as the guide.

## Prerequisite demo state

Record against a **dedicated recording org** (never production data). Seed via `scripts/record-tutorials/seed-state.ts`:

- One property ("Al Seef Residences" via the `al-seef` demo seed is fine, but a *fresh* 2-unit property named "Harbour View" gives a more honest empty state) with 2 units and **no tenants, no income, no expenses**.
- Setup Checklist should therefore show units ✅ but tenants / portal / first-entry ⚠ — the video's whole arc is turning those amber rows green.
- Logged-in user: the recording manager account (org-admin, single org, so no org-switcher appears).

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:10 | `/dashboard` | Land on dashboard; cursor rests on the Setup Checklist card | This is your dashboard on day one. The checklist at the top is your to-do list. |
| 0:10–0:22 | `/dashboard` | Hover the checklist rows; point at the percent bar | Every amber row is something not set up yet — and each one has a shortcut link. |
| 0:22–0:30 | `/dashboard` | Click the "Add tenant" CTA link on the tenants row | Let's start with the big one: putting a tenant on a lease. |
| 0:30–1:05 | `/tenants` | Click "Add Tenant", fill name, pick unit, monthly rent, lease start date | Name, unit, rent, lease start. That's all the app needs to start tracking. |
| 1:05–1:15 | `/tenants` | Save; tenant row appears | Saved. The unit is now occupied and rent is expected every month. |
| 1:15–1:35 | `/tenants/[id]` | Open the tenant; scroll to the portal link section; click "Generate portal link" | Every tenant gets a portal link — no password, no app to install. |
| 1:35–1:50 | `/tenants/[id]` | Copy the link; hover the copy confirmation | Share this on WhatsApp or email. Tenants see their balance, invoices and documents here. |
| 1:50–2:20 | `/income` | Go to Income, click "Add Entry", pick the tenant, enter the rent amount, save | When rent lands in your account, record it here. Pick the tenant, enter the amount, done. |
| 2:20–2:35 | `/income` | Point at the Collected / Expected summary cards | The app now knows what you expected and what actually arrived. |
| 2:35–3:05 | `/expenses` | Go to Expenses, click "Add Expense", pick a category, amount, save | Spending works the same way. Category, amount, save — that's your P&L building itself. |
| 3:05–3:25 | `/dashboard` | Return to dashboard; checklist percent has climbed; rows now green | Back on the dashboard, the checklist has caught up. Green rows mean the app can stop nagging. |
| 3:25–3:50 | `/dashboard` | Slow scroll down the dashboard KPIs | From here everything updates itself — arrears, occupancy, cash flow. |
| 3:50–4:00 | `/dashboard` | Hold on the checklist | Finish the remaining rows when you have five minutes. It's worth it. |

## Wrong-way-first beat

Not applicable — this tutorial is a happy path. (The petty-cash tutorial owns the deliberate mistake.)

## Closing line

"Next up: getting your existing records in — Bulk import without duplicates."
