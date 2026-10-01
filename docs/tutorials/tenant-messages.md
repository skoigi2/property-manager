# Tutorial shot list — `tenant-messages`

**Target length:** 1:02 (62 s)
**Audience:** A property manager whose tenants send questions and updates through the tenant portal.
**Job-to-be-done:** Notice a tenant's message without checking every tenant's page, answer it, and clear the ones that need no reply.

## Prerequisite demo state

Recorded in the **utilities** tutorial's account and org — `guide-utilities@groundworkpm.com` / "Nairobi Homes Management" (KES). `seed-tenant-messages.ts` runs the utilities seed (a fresh **Kilimani Court** demo), then writes two portal conversations straight to the database:

- **Faith Chebet** (unit 103) — "Water pressure in the kitchen", sent two hours ago (*New today*);
- **Grace & Daniel Kamau** (102) — "Thank you!", sent three days ago, so it is urgent (*Waiting 3d*) and needs no reply.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:07 | `/inbox` | Hover Faith's *Tenant message* row | When a tenant writes from their portal, it lands in your Inbox — no need to check each tenant's page. |
| 0:07–0:13 | same | Hover the Kamaus' *Waiting 3d* pill | It shows how long they've been waiting, and turns urgent after two days without a reply. |
| 0:13–0:19 | same | Hover Faith's subject line | The property's managers also get an email with a link straight to the conversation. |
| 0:19–0:25 | `/tenants/[Faith]?tab=messages&thread=` | **Reply**; the conversation opens; hover the message | Reply opens the conversation on the tenant's page. |
| 0:25–0:35 | same | Type the answer → **Send Reply** | Answer it here. The tenant sees your reply in their portal, and the message leaves your Inbox. |
| 0:35–0:44 | `/inbox` | Hover, then click **Mark resolved** on the Kamaus' row | No reply needed? Mark resolved closes it. If the tenant writes again, it comes back. |
| 0:44–0:50 | same | Hold | Prefer no emails? Switch them off on the Automations page — the Inbox still shows every message. |
| 0:50–0:54 | same | Hold | That's tenant messages: in your Inbox, answered in one place. |

Slow dev-server page loads are cut with `offCamera`.

## Wrong-way-first beat

None — this is a flow tutorial.

## Closing line

"That's tenant messages: in your Inbox, answered in one place."
