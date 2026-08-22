# Tutorial shot list — `cases-and-approvals`

**Target length:** 4:00 (240 s)
**Audience:** A manager coordinating repairs over calls and WhatsApp, losing track of who's waiting on whom — and chasing owners for sign-off.
**Job-to-be-done:** See a maintenance issue live as a case (one timeline, staged workflow) and get an owner's approval by magic link with no login.

## Prerequisite demo state

Seeded by `seed-state.ts`:

- **Al Seef Residences** org with at least one vendor in the registry (for the assign beat).
- One existing maintenance case mid-workflow (stage `triaged`) so the case list isn't empty; the video creates a second job live.
- An approver email inbox is NOT needed on screen — the approval page is opened directly by token (`/approve/[token]`), standing in for the email click.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:15 | `/maintenance` | Land on Maintenance; click "Report job"; fill title ("Leaking kitchen tap"), property, priority; save | Report a maintenance job the way you always do. |
| 0:15–0:30 | `/maintenance` | The new JobCard shows an "Open case →" link; click it | Notice the link on the card: every job automatically gets a case. |
| 0:30–0:55 | `/cases/[id]` | Case detail: sweep the timeline, the stage tracker, the right panel | A case is the issue's whole life in one place — timeline, stage, who's waiting on whom. |
| 0:55–1:15 | `/cases/[id]` | Type a comment ("Plumber quoted 4,500 — awaiting go-ahead"); post it | Comments land on the timeline. So do emails and documents. Nothing lives in your chat history. |
| 1:15–1:40 | `/cases/[id]` | Click Advance on the stage tracker; add a note; confirm | As work progresses, advance the stage. Forward only — going back needs a written reason. |
| 1:40–2:00 | `/cases/[id]` | Point at "Waiting on" in the right panel | The case tracks who the ball is with. That's what stops things silently stalling. |
| 2:00–2:25 | `/cases/[id]` | Click "Request approval"; fill approver email, question, amount; send | Now the owner sign-off. No more screenshots on WhatsApp — request a real approval. |
| 2:25–2:45 | `/approve/[token]` | Open the approval page (the link from the owner's email) | The owner gets this link by email. No account, no password — it works on their phone. |
| 2:45–3:10 | `/approve/[token]` | Type the approver's name; click Approve | They read the question, type their name, and decide. That name is recorded with the decision. |
| 3:10–3:35 | `/cases/[id]` | Back on the case: timeline shows APPROVAL GRANTED; stage has auto-advanced | Back on the case: the approval is on the timeline, and the stage moved forward by itself. |
| 3:35–3:50 | `/cases` | Case list with filters (Waiting on / Status) | The Cases page is your whole operation, filterable by who's blocking what. |
| 3:50–4:00 | `/cases` | Hold | Every repair, renewal and arrears chase can live like this. One timeline each. |

## Wrong-way-first beat

Named, not performed: the narration at 2:00 calls out the WhatsApp-screenshot sign-off as the wrong way the approval flow replaces.

## Closing line

"Next: the clean goodbye — tenant checkout and deposit settlement."
