# Tutorial shot list — `caretaker-inspections`

**Target length:** 2:00 (120 s)
**Audience:** A caretaker running a move-in, mid-term or move-out inspection on site, on their phone.
**Job-to-be-done:** Find the inspection assigned to them, record every room with photos, take the readings, keys and signature, and hand it in.

## Prerequisite demo state

Recorded as the **caretaker** of the utilities tutorial's org — `guide-caretaker@groundworkpm.com` ("Joseph Mwangi", same dev password) in "Nairobi Homes Management" (KES). `seed-caretaker.ts` (`seedCaretakerInspections`) runs the utilities seed (a fresh **Kilimani Court** demo), then:

- gives **Peter Omondi** (unit 302) an emergency contact and an **accepted move-in report** (every feature GOOD) to compare against;
- books a **move-out inspection** for today, 10:00, assigned to the caretaker, with every room rated and photographed except the **Bathroom** (the Living Room walls are FAIR, "Scuff marks behind the sofa").

Local dev has no file storage: `fake-storage.ts` writes uploaded photos as fixture rows and serves `fixtures/photos/` back.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:06 | `/inspections` | Hover the move-out row under To do | Inspections assigned to you are under To do — you also get an email when one is booked. |
| 0:06–0:13 | `/inspections/[id]` | Open it; hover the tenant details | At the top: the tenant's phone, ID number and emergency contact — what you need on site. |
| 0:13–0:18 | same | Hover the Kitchen chip (ticked) | Go room by room. A tick means the room is rated and has its three photos. |
| 0:18–0:23 | same | Bathroom chip; hover "At move-in" on Walls | On a move-out, every feature shows how it was at move-in. |
| 0:23–0:35 | same | Rate features GOOD; Sink/Taps POOR + note + photo | Rate each feature. Something wrong? Mark it, say what, and photograph it. |
| 0:35–0:45 | same | Rest GOOD; two more photos; hover the chip (3/3) | At least three photos per room — they protect you and the tenant if there's a dispute. |
| 0:45–0:52 | same, Sign-off | Type the two final meter readings | Take the final meter readings — the manager's checkout uses them. |
| 0:52–0:57 | same | Keys: Main door × 2, Gate × 1 | Count the keys the tenant hands back. |
| 0:57–1:08 | same | Signed → draw the signature → Save signature | The tenant signs on your phone. Not there, or won't sign? Record that instead and carry on. |
| 1:08–1:15 | same | Hover Hand in for review | Hand it in. Your findings lock — the manager reviews them but can't change what you saw. |
| 1:15–1:21 | same | Click it; the review shows Awaiting review | The manager is emailed, prices any damage and raises the repair jobs. |
| 1:21–1:25 | same | Hold | That's an inspection: room by room, photos, sign-off, hand in. |

Slow dev-server loads and saves are cut with `offCamera`.

## Wrong-way-first beat

None — this is a flow tutorial.

## Closing line

"That's an inspection: room by room, photos, sign-off, hand in."
