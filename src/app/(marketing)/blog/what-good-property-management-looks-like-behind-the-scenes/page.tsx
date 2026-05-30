import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "what-good-property-management-looks-like-behind-the-scenes")!;

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
        Good property management is almost invisible. From the outside it looks like calm: rent
        arrives, repairs get handled, tenants stay, owners get paid and nobody seems to be rushing.
        It&apos;s tempting to assume the people running it are simply more relaxed, or have easier
        properties.
      </p>
      <p>
        They don&apos;t. Behind that calm is a set of deliberate systems doing the work that, in a
        struggling operation, a stressed human is trying to do from memory. The difference between
        &quot;good&quot; and &quot;chaotic&quot; isn&apos;t talent or effort — it&apos;s what happens backstage.
        Here&apos;s what that looks like.
      </p>

      <h2>1. Nothing important depends on someone remembering</h2>
      <p>
        In a well-run operation, no critical task lives only in a person&apos;s head. Lease expiries,
        rent due dates, insurance renewals and compliance deadlines are all held by the system,
        which raises them before they bite. The manager isn&apos;t trusted to remember seventy clocks —
        they&apos;re trusted to act on the handful the system surfaces each day.
      </p>
      <p>
        This is the quiet superpower of good management. It isn&apos;t superior memory; it&apos;s the
        decision to stop relying on memory at all.
      </p>

      <h2>2. Every issue has an owner and a status</h2>
      <p>
        Ask a good operator about any open matter — a repair, a renewal, an arrears case — and
        they can tell you instantly where it stands and who has the next move. Not because they
        memorised it, but because every issue is tracked as a discrete piece of work with a state:
        open, waiting on the owner, waiting on the contractor, resolved.
      </p>
      <p>
        Work stalls in the gaps between people. The behind-the-scenes fix is making those gaps
        visible — so a job waiting three days on an approval is obvious, not invisible.
      </p>

      <h2>3. The day starts from one prioritised view</h2>
      <p>
        A chaotic operation starts the day reactively — opening WhatsApp and dealing with whoever
        messaged most recently or most loudly. A good one starts from a single list of what
        actually needs attention: overdue rent, leases expiring soon, urgent maintenance, approvals
        that are waiting. Priorities are decided by importance, not by volume.
      </p>
      <p>
        That one habit — working from a prioritised queue rather than an inbox — is most of what
        separates a manager who&apos;s in control from one who&apos;s being chased by their own portfolio.
      </p>

      <TrialCTA headline="Calm isn't the absence of problems. It's a system that surfaces the right ones in the right order." />

      <h2>4. Owners are updated before they ask</h2>
      <p>
        The owners of a well-managed portfolio rarely chase, because they rarely need to. Their
        statements arrive on time, their questions get answered in minutes, and bad news reaches
        them early with a plan attached. Trust is built not by promising perfection but by never
        leaving the owner in the dark.
      </p>
      <p>
        Behind the scenes, this is possible because reporting is a by-product of the daily work,
        not a monthly scramble. The data is already structured, so a statement is a click, not a
        project.
      </p>

      <h2>5. The money reconciles continuously, not in a panic</h2>
      <p>
        Good operators always know, roughly, who owes what. Rent received is recorded against the
        invoice it pays. Arrears are visible the day they occur, not the week the bank statement
        gets reviewed. Expenses attach to the property they belong to as they happen.
      </p>
      <p>
        This continuous reconciliation is unglamorous and it&apos;s the backbone of the whole thing. It
        means month-end is a summary of work already done — not a frantic reconstruction of what
        happened.
      </p>

      <h2>6. Handovers don&apos;t lose information</h2>
      <p>
        The truest test of a good operation is what happens when someone is unavailable. Can a
        colleague pick up a property cold and know its full history — the lease, the tenant, the
        open jobs, the owner&apos;s preferences? In a well-run operation, yes, because the knowledge
        lives in the system, not in one person.
      </p>
      <p>
        In a struggling one, the answer is no — and that single fact caps how large and how
        resilient the business can ever become.
      </p>

      <h2>A day in two operations</h2>
      <p>
        Two managers, same ten properties, same Tuesday. The struggling one opens their phone to
        forty messages, answers the loudest, forgets a renewal, gets surprised by an arrears case
        at month-end and spends Friday evening rebuilding an owner statement from bank records.
      </p>
      <p>
        The good one opens a single prioritised view: two overdue invoices to chase, one lease to
        renew this week, one urgent repair to approve. They handle the three things that matter,
        the system handles the remembering, and the owner statement is already drafted from the
        month&apos;s tracked activity. Same workload. Completely different experience — and a very
        different result.
      </p>

      <h2>Good management is a system, not a personality</h2>
      <p>
        The reassuring part is that none of this requires being a naturally organised person. The
        operators who make it look easy aren&apos;t more disciplined than you — they&apos;ve just moved the
        discipline out of their heads and into a structure that holds it for them.
      </p>
      <p>
        That&apos;s what &quot;good&quot; looks like behind the scenes: not heroics, but a handful of systems
        quietly doing the remembering, the prioritising and the evidencing — so that, from the
        outside, everything simply looks calm.
      </p>
    </BlogPostLayout>
  );
}
