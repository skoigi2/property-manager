import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "manage-property-maintenance-without-whatsapp")!;

export const metadata: Metadata = {
  title: `${post.title} — Groundwork PM`,
  description: post.excerpt,
  alternates: { canonical: `https://groundworkpm.com/blog/${post.slug}` },
  openGraph: {
    title: post.title,
    description: post.excerpt,
    url: `https://groundworkpm.com/blog/${post.slug}`,
    siteName: "Groundwork PM",
    type: "article",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["https://groundworkpm.com/og-image.png"] },
};

export default function Article() {
  return (
    <BlogPostLayout post={post}>
      <p>
        WhatsApp is not a maintenance management system. It just feels like one — until something
        falls through the cracks.
      </p>
      <p>
        The tenant messages you about a leaking pipe. You read it, intend to call the plumber,
        and get distracted. Three days later the tenant follows up. You apologise, call the plumber,
        who visits a week after that. The tenant is now frustrated. The repair costs more because
        the leak got worse. And you have no record of any of it.
      </p>
      <p>
        This is the WhatsApp maintenance loop. Most landlords are in it. Here&apos;s how to get out.
      </p>

      <h2>Why WhatsApp fails as a maintenance tool</h2>
      <p>
        The problem with WhatsApp isn&apos;t that it&apos;s bad at communication. It&apos;s that it has no
        structure for work management. A message is just a message — it has no status, no
        assignee, no deadline, no cost field, and no way to tell whether it&apos;s been acted on.
      </p>
      <ul>
        <li>
          <strong>Messages get buried.</strong> A maintenance request from 11 days ago is now
          97 messages up in the thread. You know it&apos;s there somewhere. You&apos;re not sure if it
          was resolved or just never followed up.
        </li>
        <li>
          <strong>No assignment.</strong> Who is fixing the boiler? You called the plumber, but
          did you confirm? Did they acknowledge? Is it on their list? WhatsApp gives you no way
          to know without sending another message.
        </li>
        <li>
          <strong>No record of cost.</strong> The job gets done. The plumber invoices you. The
          invoice goes to email. The original maintenance request stays in WhatsApp. These two
          things are never connected — so your expense records are always incomplete.
        </li>
        <li>
          <strong>Liability risk.</strong> A tenant reports damp. The message gets missed. The
          damp causes damage to their belongings. They claim you were notified and took no action.
          WhatsApp is not an audit trail. A maintenance log is.
        </li>
      </ul>

      <h2>What a maintenance log actually needs</h2>
      <p>
        A proper maintenance system has five fields that WhatsApp will never have:
      </p>
      <ol>
        <li><strong>Job description</strong> — what&apos;s the issue and which unit it&apos;s in</li>
        <li><strong>Priority</strong> — urgent, high, medium, or low (so you know what to action first)</li>
        <li><strong>Assigned vendor</strong> — who is responsible for the repair</li>
        <li><strong>Status</strong> — open, in progress, or resolved</li>
        <li><strong>Cost</strong> — what the repair cost, linked to your expense records</li>
      </ol>
      <p>
        With these five fields in place, you can answer any maintenance question at a glance:
        what&apos;s outstanding, what&apos;s been assigned, what&apos;s cost me this month, and what&apos;s been
        resolved for each property.
      </p>

      <TrialCTA headline="Log it once. Know its status, cost, and history — forever." />

      <h2>The maintenance workflow, step by step</h2>

      <h3>Step 1: Log the job immediately when it&apos;s reported</h3>
      <p>
        The moment a tenant reports an issue — by message, phone call, or in person — create a
        maintenance job. Don&apos;t wait until you&apos;ve arranged a contractor. Don&apos;t screenshot the
        WhatsApp message and tell yourself you&apos;ll deal with it later. Log it immediately.
      </p>
      <p>
        This takes 60 seconds and ensures nothing is ever missed. The job exists in the system,
        it has an open status, and it will stay visible until it&apos;s marked resolved.
      </p>

      <h3>Step 2: Set priority and assign a vendor</h3>
      <p>
        Once logged, set a priority. A burst pipe is urgent — it goes to the top of the list and
        gets immediate action. A squeaky door hinge is low priority — it gets scheduled when
        a contractor is already on site.
      </p>
      <p>
        Then assign the job to a vendor from your contractor list. This is the person responsible
        for the work. Having an assigned vendor means there&apos;s no ambiguity about who should be
        acting on this — and you can follow up with one specific person if it stalls.
      </p>

      <h3>Step 3: Update status as the job progresses</h3>
      <p>
        Move the job from Open to In Progress when the contractor is booked. Move it to Resolved
        when the work is done. This takes seconds but gives you a complete picture of your
        maintenance queue at any time.
      </p>
      <p>
        You no longer need to check WhatsApp to know what&apos;s been sorted. Open the maintenance
        log and everything outstanding is right there.
      </p>

      <h3>Step 4: Log the cost when the job is closed</h3>
      <p>
        When the invoice arrives, log the repair cost against the maintenance job. This does two
        things: it closes the loop on the job record, and it creates an expense entry linked to
        the correct property and unit. Your maintenance history and your expense records become
        the same data — not two separate things you have to reconcile.
      </p>

      <h2>The shift from reactive to proactive</h2>
      <p>
        WhatsApp keeps you reactive. Something breaks, someone messages, you scramble to fix it.
        A maintenance log lets you become proactive — you can see patterns, plan preventive work,
        and budget for repairs before they become emergencies.
      </p>
      <p>
        Which properties generate the most maintenance jobs? Which units cost the most to maintain?
        Which contractor is slowest to respond? These questions are unanswerable from WhatsApp.
        From a maintenance log, they take seconds.
      </p>
      <p>
        Managing maintenance without WhatsApp isn&apos;t about removing communication — tenants can
        still message you. It&apos;s about what happens after they do. The message triggers a job.
        The job has a status. The job has an owner. The job has a cost. And nothing falls through
        the cracks because there are no cracks — just a list with a status on every item.
      </p>
    </BlogPostLayout>
  );
}
