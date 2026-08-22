# Tutorial shot list — `bulk-import`

**Target length:** 4:00 (240 s)
**Audience:** A manager moving off spreadsheets, worried about duplicating or mangling their data.
**Job-to-be-done:** Import records from an XLSX template safely, and understand why re-uploads don't create duplicates — plus the "Update existing records" and "Export existing" round-trip.

## Prerequisite demo state

- Recording org with the **Al Seef Residences** demo seeded (`al-seef`) so the expenses tab has existing rows for the "Export existing" beat.
- A pre-filled `tenants-import.xlsx` and `expenses-import.xlsx` on disk for the recorder to attach (kept in `scripts/record-tutorials/fixtures/`). The tenants file has 3 valid rows and 1 deliberately broken row (missing Monthly Rent) so the validation preview has something to flag.

## Shot list

| Time | Route | Action | Subtitle line |
|---|---|---|---|
| 0:00–0:12 | `/import` | Land on the Data Import page; point at the numbered how-to banner | Everything here follows the same four steps: download, fill, upload, confirm. |
| 0:12–0:25 | `/import` | Sweep the cursor across the tab bar (Tenants … Handover) | One tab per record type. We'll do tenants first — the flow is identical everywhere. |
| 0:25–0:40 | `/import` (Tenants tab) | Click "Download template" | The template is pre-formatted. Never build your own spreadsheet from scratch. |
| 0:40–0:55 | `/import` | (Cut to the filled template screenshot) Point at row 2 | Row two tells you which columns are required. The Instructions sheet explains every column. |
| 0:55–1:15 | `/import` | Upload the filled file via the file picker | Upload it. Nothing is imported yet — the rows are checked in your browser first. |
| 1:15–1:40 | `/import` | Validation preview renders; point at the row flagged with an error | One row is missing its rent, and the app says so — per row, before anything is saved. |
| 1:40–1:55 | `/import` | Click the Import button | Import the valid rows. The broken one just waits for a fix — no all-or-nothing. |
| 1:55–2:10 | `/import` | Result card shows imported / skipped counts | Three imported. And here's the safety net: run the same file again… |
| 2:10–2:25 | `/import` | Re-upload the same file; import; result shows all skipped | …and everything is skipped. Duplicates are detected, not doubled. |
| 2:25–2:45 | `/import` (Expenses tab) | Switch to Expenses; click "Export existing" | Now the power move. Expenses can export your live data, pre-filled into the template. |
| 2:45–3:05 | `/import` | (Cut to exported file) Point at the ID column | See the ID column? That's what lets you edit anything in Excel without creating a duplicate. |
| 3:05–3:30 | `/import` | Upload the edited file; tick "Update existing records" | Tick "Update existing records" — matched rows are refreshed instead of skipped. |
| 3:30–3:45 | `/import` | Import; result shows updated count | Every edit landed on the right row. No duplicates, no re-keying. |
| 3:45–4:00 | `/import` | Hold on the tab bar | Same pattern for units, income, petty cash and the rest. Your spreadsheet era is over. |

> Recorder note: the "(Cut to …)" beats are narrated over the live page rather than cutting to Excel — the recorder can't show a spreadsheet app. The download button is labelled "Download Tenants Template" (name varies per tab); the import button reads "Import N valid rows"; the second-run reset uses "Start fresh". The upsert/ID beats (2:45–3:45) are narrated over the Expenses tab's "Export existing" affordance without performing the round-trip on camera.

## Wrong-way-first beat

The deliberately broken row (missing required field) at 1:15 is the mistake beat — it shows validation catching problems *before* import rather than corrupting data silently.

## Closing line

"Next: how invoices and income stay in sync — so you never book rent twice."
