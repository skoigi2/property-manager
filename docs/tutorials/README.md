# Tutorial videos

Short (≤4 min) contextual walkthroughs, recorded **automatically** by a
Playwright script against a demo org and surfaced in-app by
`<TutorialVideo />` exactly where each workflow's confusion happens.
Subtitles ship as a proper WebVTT track (not burned in), so everything can be
regenerated whenever the UI changes.

## Moving parts

| Piece | Where | Role |
|---|---|---|
| Registry | [`src/lib/tutorial-videos.ts`](../../src/lib/tutorial-videos.ts) | Typed metadata per tutorial: title, target/actual duration, media URLs, written summary + steps, `next` chain |
| Component | [`src/components/ui/TutorialVideo.tsx`](../../src/components/ui/TutorialVideo.tsx) | `variant="link"` (small "▶ Watch how this works" → modal) and `variant="inline"` (full card). Degrades to the written version while media files are missing |
| Index page | `/help/tutorials` | Every tutorial inline, in `TUTORIAL_ORDER` |
| Shot lists | `docs/tutorials/<key>.md` | **Source of truth for wording.** The recorder scripts copy their `say()` lines from here |
| Recorder | `scripts/record-tutorials/` | harness + seed-state + one script per tutorial + VTT generator + ffmpeg postprocess |
| Output | `public/tutorials/<key>.mp4/.jpg/.vtt` | Committed to the repo (see Storage below) |

## Running the recorder

Prerequisites (all local, never production):

1. `DATABASE_URL` pointing at **localhost** Postgres (or a Supabase project whose
   hostname contains `dev`) — `seed-state.ts` refuses anything else.
2. Dev server running: `npm run dev` (localhost:3000).
3. The recording account (defaults: `guide@groundworkpm.com` / dev password —
   the same dedicated org used by `scripts/capture-screenshots.js`; override
   with `RECORD_EMAIL` / `RECORD_PASSWORD` / `RECORD_BASE_URL`).
4. `ffmpeg` and `bash` on PATH (Windows: `winget install Gyan.FFmpeg`, run from
   Git Bash or let the orchestrator spawn bash).
5. Chromium for Playwright: `npx playwright install chromium` (one-time).

Then:

```bash
npm run tutorials:record first-15-minutes   # one tutorial
npm run tutorials:record all                # everything, in registry order
npm run tutorials:record all -- --burn      # + <key>.captioned.mp4 for sharing outside the app
```

Per tutorial the pipeline runs: **seed-state** (idempotent preconditions) →
**record** (Playwright, 1280×800, fake cursor, `say()` cues) → **vtt.ts**
(WebVTT from the cue timeline, +2 s shift for the title card) →
**postprocess.sh** (webm→h264 mp4, 2 s title card, 2 s "Next: …" end card,
poster at 3 s). It prints output paths and actual-vs-target duration, and
patches `durationSec` in the registry to the actual value.

Raw captures live in `scripts/record-tutorials/output/<key>/` (gitignored),
including `<key>.timeline.json` — every action with a timestamp and how long
its selector took to resolve. **Any step with `findMs` > 3000 is flagged as a
fragile selector**; prefer stable attributes (`data-testid`, `name`,
`placeholder`, exact labels) over text guesses.

## Adding a new tutorial

1. **Registry entry** — add the key to `TutorialKey`, an entry in
   `TUTORIAL_VIDEOS` (summary + steps must stand alone as the written
   fallback), and slot it into `TUTORIAL_ORDER` / the `next` chain.
2. **Shot list** — `docs/tutorials/<key>.md`: target length, audience,
   job-to-be-done, prerequisite demo state, the `Time | Route | Action |
   Subtitle line` table, a wrong-way-first beat where applicable, closing line.
3. **Seed** — a case in `seed-state.ts` (`seedForTutorial`) creating the
   preconditions, idempotently.
4. **Recorder script** — `scripts/record-tutorials/<key>.ts` translating the
   shot list into harness calls; `say()` lines copied verbatim.
5. **Entry point** — mount `<TutorialVideo tutorialKey="<key>" variant="link" />`
   where the confusion actually happens (see the mounts in Part 2 of the git
   history for the pattern).
6. `npm run tutorials:record <key>`, check the timeline JSON, fix, re-record.

## Subtitles: generated, never hand-edited

`public/tutorials/<key>.vtt` is a build artifact. To change what a tutorial
says: edit the subtitle line in `docs/tutorials/<key>.md`, mirror it in the
`say()` call of `scripts/record-tutorials/<key>.ts`, and re-run the recorder.
Hand edits to the VTT will be silently overwritten by the next recording.

`vtt.ts` enforces: ≤2 lines per cue, ≤42 chars per line (long lines split
across consecutive cues), minimum 1.5 s per cue, no overlaps, and a `NOTE`
header carrying the key + generation date.

## Adding a translated track

No re-recording needed. Produce a second VTT (translate the cue text, keep the
timings), save it as e.g. `public/tutorials/<key>.sw.vtt`, and add a second
`<track>` in `TutorialVideo.tsx`:

```tsx
<track kind="subtitles" srcLang="sw" label="Kiswahili" src={`/tutorials/${key}.sw.vtt`} />
```

(Leave `default` on the English track; viewers switch via the native player
menu.)

## Adding narration later

The timeline JSON (`output/<key>/<key>.timeline.json`) holds each cue's
`start`/`end` in ms from recording start (add 2000 ms for the title card, as
the VTT generator does). Record audio clips per cue, lay them on those
timestamps, and mux:

```bash
ffmpeg -i public/tutorials/<key>.mp4 -i narration.m4a -c:v copy -c:a aac -shortest out.mp4
```

The `say()` dwell times were chosen to fit spoken delivery, so cue-aligned
narration fits without re-timing the video.

## Re-recording checklist (when a screen changes)

1. Does the shot list still describe reality? Update routes/actions/wording in
   `docs/tutorials/<key>.md` first — it is the source of truth.
2. Mirror any wording change into the `say()` calls of the recorder script;
   fix selectors for renamed controls (grep the component for the new label).
3. Re-check the seed still produces the precondition (demo data drifts).
4. `npm run tutorials:record <key>` — then review `<key>.timeline.json` for
   slow-selector warnings and watch the mp4 once before committing.
5. Commit the regenerated `.mp4` / `.jpg` / `.vtt` together with the code
   change that altered the screen, so app and video never drift apart in `main`.

## Storage migration (when files get large)

Media is committed to the repo for now (each mp4 is ~2–4 MB). Once any file
exceeds ~5 MB:

1. Create a **public-read** Supabase Storage bucket `tutorial-videos`
   (manually, in Supabase Studio — same as `case-attachments`, but public).
2. Upload `public/tutorials/*` into it, preserving filenames.
3. Point the registry's `videoUrl` / `posterUrl` / `subtitleUrl` at the public
   bucket URLs (`https://<project>.supabase.co/storage/v1/object/public/tutorial-videos/<key>.mp4`).
4. Delete the files from `public/tutorials/` and add the folder to
   `.gitignore`; teach `postprocess.sh`/`run.ts` to upload instead of (or after)
   writing locally.
5. Keep the `.vtt` on the same origin or ensure the bucket sends permissive
   CORS headers — browsers block cross-origin text tracks without them.

## Known recording quirks

- Dev-mode route compiles are slow on first hit; the harness waits for
  spinners and uses generous timeouts, but a cold `npm run dev` benefits from
  one warm-up pass (`all` effectively self-warms).
- The `tenant-checkout` script hovers Finalize but never clicks it — actually
  finalising would vacate the demo tenant and break idempotent re-recording.
- The proof-of-payment seed submits a real file through the portal API, so
  Supabase storage env vars must be configured in `.env` for the drawer's
  image preview to work (it falls back to text-only proof otherwise).
