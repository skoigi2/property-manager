# Tutorial shot list — `guest-stays`

**Target length:** 2:10 (130 s)
**Audience:** A caretaker looking after short-stay (Airbnb-style) units.
**Job-to-be-done:** Check a guest in (ID, keys), check a guest out (keys back, post-stay check) and hand the unit to the cleaner.

## Prerequisite demo state

Recorded as the **caretaker** of the utilities tutorial's org — `guide-caretaker@groundworkpm.com` ("Joseph Mwangi"). `seed-caretaker.ts` (`seedGuestStays`) runs the utilities seed, then creates **Westlands Suites** (a short-stay block, KES) with:

- **A1** — arriving today, no guest recorded yet (added on camera: Amina Wanjiru);
- **A2** — Daniel Mutua leaving today, ID on file, keys out; A2's previous stay has an accepted post-stay check (rooms Living Room, Kitchen, Bedroom, Bathroom, all fine) — the "Last stay" comparison;
- **A3** — in house; **B1** — arriving in three days; two earlier stays for the calendar.

The sample ID and room photos are fixtures served by `fake-storage.ts` (local dev has no file storage).

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:06 | `/stays` | Hover *Arriving* | Guest stays shows today's short-stay guests — who arrives, who leaves, who is in. No prices, ever. |
| 0:06–0:11 | same | Hover the A2 card | Each card shows the ID, the keys, and after check-out the check and the cleaning. |
| 0:11–0:20 | `/stays/[A1]` | Type the guest → Add guest; hover the locked keys button | Add the guest. The keys stay locked until the main guest's ID is on file. |
| 0:20–0:26 | same | Photo of ID | Take a photo of their passport or ID. A manager can waive it, with a reason. |
| 0:26–0:34 | same | Gate + 1 → Hand over keys | Pick the keys they get and hand them over — the time and your name are recorded. |
| 0:34–0:40 | `/stays/[A2]` | Keys returned | When the guest leaves, mark the keys back, then start the post-stay check. |
| 0:40–0:47 | `/inspections/[id]` | Start the check; hover "Last stay" | A quick check: each room is fine or damaged, with one photo. 'Last stay' shows how it was left before. |
| 0:47–1:05 | same | Fine + photo × 3; Bathroom Damaged + note + photo | Something broken? Mark it damaged, say what, and photograph it. |
| 1:05–1:12 | same | Finish → hover Hand in for review → click | Hand it in. A clean check is simply filed; damage goes straight to the manager. |
| 1:12–1:22 | `/stays/[A2]` | Open the stay → type the supervisor → Keys to the cleaner | Give the keys to the cleaning supervisor, and mark them back when the unit is ready. |
| 1:22–1:26 | `/stays?view=calendar` | Hover a booking | The calendar shows every short-stay unit's bookings for the month. |
| 1:26–1:30 | same | Hold | That's guest stays: ID, keys, check, cleaner — all on your phone. |

Slow dev-server loads and saves are cut with `offCamera`.

## Wrong-way-first beat

The keys button is shown locked before the ID is uploaded.

## Closing line

"That's guest stays: ID, keys, check, cleaner — all on your phone."
