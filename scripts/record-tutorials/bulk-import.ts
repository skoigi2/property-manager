/**
 * Recorder script for `bulk-import`.
 * Subtitle lines are verbatim from docs/tutorials/bulk-import.md.
 * Uses the pre-generated fixture workbook from seed-state (fixtures/).
 */
import * as path from "path";
import { Harness } from "./harness";
import { FIXTURES_DIR } from "./seed-state";

export async function record() {
  const tenantsFile = path.join(FIXTURES_DIR, "tenants-import.xlsx");

  const h = new Harness("bulk-import");
  await h.start();

  await h.goto("/import");
  await h.say("Everything here follows the same four steps: download, fill, upload, confirm.", 6000);

  await h.hover('button:has-text("Vendors")');
  await h.hover('button:has-text("Tenants")');
  await h.say("One tab per record type. We'll do tenants first — the flow is identical everywhere.", 6000);

  await h.hover('button:has-text("Download Tenants Template")');
  await h.say("The template is pre-formatted. Never build your own spreadsheet from scratch.", 7000);

  await h.say("Row two tells you which columns are required. The Instructions sheet explains every column.", 7500);

  await h.upload('input[type="file"]', tenantsFile);
  await h.say("Upload it. Nothing is imported yet — the rows are checked in your browser first.", 8000);

  await h.hover('text=Broken Row');
  await h.say("One row is missing its rent, and the app says so — per row, before anything is saved.", 8000);

  await h.click('button:has-text("valid row")');
  await h.say("Import the valid rows. The broken one just waits for a fix — no all-or-nothing.", 6000);

  await h.say("Three imported. And here's the safety net: run the same file again…", 5000);
  await h.click('button:has-text("Start fresh")');
  await h.upload('input[type="file"]', tenantsFile);
  await h.pause(1500);
  await h.click('button:has-text("valid row")');
  await h.say("…and everything is skipped. Duplicates are detected, not doubled.", 6500);

  // Expenses tab: export-existing round-trip.
  await h.click('button:has-text("Expenses")');
  await h.hover('button:has-text("Export existing")');
  await h.say("Now the power move. Expenses can export your live data, pre-filled into the template.", 7500);

  await h.say("See the ID column? That's what lets you edit anything in Excel without creating a duplicate.", 8000);

  await h.say("Tick \"Update existing records\" — matched rows are refreshed instead of skipped.", 8000);
  await h.say("Every edit landed on the right row. No duplicates, no re-keying.", 5500);

  await h.hover('button:has-text("Handover")');
  await h.say("Same pattern for units, income, petty cash and the rest. Your spreadsheet era is over.", 6500);
  await h.say("Next: how invoices and income stay in sync — so you never book rent twice.", 4000);

  return h.finish();
}
