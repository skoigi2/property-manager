/**
 * Recorder script for `cases-and-approvals`.
 * Subtitle lines are verbatim from docs/tutorials/cases-and-approvals.md.
 * The approval magic link is fetched from the DB after the UI sends it
 * (standing in for the owner clicking the link in their email).
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";

export async function record() {
  const h = new Harness("cases-and-approvals");
  await h.start();

  await h.goto("/maintenance");
  await h.say("Report a maintenance job the way you always do.", 3000);
  await h.click('button:has-text("Log Job")');
  await h.type('input[name="title"]', "Leaking kitchen tap");
  await h.selectIndex('select[name="propertyId"]', 1);
  await h.click('dialog button:has-text("Log Job")');
  await h.page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 });
  await h.pause(1500);

  const job = await prisma.maintenanceJob.findFirst({
    where: { title: "Leaking kitchen tap" },
    orderBy: { createdAt: "desc" },
  });
  if (!job?.caseThreadId) throw new Error("Job did not auto-create a case thread.");

  await h.hover(`a[href="/cases/${job.caseThreadId}"]`);
  await h.say("Notice the link on the card: every job automatically gets a case.", 5000);
  await h.click(`a[href="/cases/${job.caseThreadId}"]`);

  await h.say("A case is the issue's whole life in one place — timeline, stage, who's waiting on whom.", 8000);

  await h.type('textarea[placeholder="Add a comment…"]', "Plumber quoted 4,500 — awaiting go-ahead");
  await h.click('button:has-text("Add comment")');
  await h.say("Comments land on the timeline. So do emails and documents. Nothing lives in your chat history.", 7000);

  // Advance: click the next stage node on the tracker, then confirm.
  await h.click('button:has(span:text-is("2"))');
  await h.click('dialog button:has-text("Advance")');
  await h.pause(1200);
  await h.say("As work progresses, advance the stage. Forward only — going back needs a written reason.", 7000);

  await h.hover('text=Waiting on');
  await h.say("The case tracks who the ball is with. That's what stops things silently stalling.", 6500);

  await h.click('button:has-text("Request approval")');
  await h.say("Now the owner sign-off. No more screenshots on WhatsApp — request a real approval.", 4000);
  await h.type('dialog input[type="email"]', "owner@example.com");
  await h.type("dialog textarea", "Approve plumber quote of 4,500 for the kitchen tap repair?");
  await h.click('dialog button:has-text("Send request")');

  // The owner's magic link — fetched from the DB, standing in for their email.
  // Poll: the first hit on the approvals route can be slowed by a dev compile.
  let approval = null;
  for (let i = 0; i < 20 && !approval; i++) {
    approval = await prisma.approvalRequest.findFirst({
      where: { caseThreadId: job.caseThreadId },
      orderBy: { createdAt: "desc" },
    });
    if (!approval) await h.pause(1000);
  }
  if (!approval) throw new Error("Approval request was not created — check the UI flow.");

  await h.goto(`/approve/${approval.token}`);
  await h.say("The owner gets this link by email. No account, no password — it works on their phone.", 7000);

  await h.type('input[placeholder="Type your full name"]', "J. Njoroge");
  await h.say("They read the question, type their name, and decide. That name is recorded with the decision.", 6000);
  await h.click('button:has-text("Approve")');
  await h.pause(2000);

  await h.goto(`/cases/${job.caseThreadId}`);
  await h.say("Back on the case: the approval is on the timeline, and the stage moved forward by itself.", 8000);

  await h.goto("/cases");
  await h.say("The Cases page is your whole operation, filterable by who's blocking what.", 5500);
  await h.say("Every repair, renewal and arrears chase can live like this. One timeline each.", 6000);
  await h.say("Next: the clean goodbye — tenant checkout and deposit settlement.", 4000);

  return h.finish();
}
