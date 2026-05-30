import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "why-property-management-breaks-down-after-10-units")!;

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
        Almost every landlord who manages their own portfolio hits the same wall. It usually
        arrives somewhere around ten units. The properties aren&apos;t fundamentally different from
        the first three you managed comfortably. The tenants aren&apos;t worse. You haven&apos;t become
        less capable. And yet things start slipping — a renewal missed here, a deposit dispute
        you can&apos;t evidence there, an owner asking a question you can&apos;t answer quickly.
      </p>
      <p>
        The reason isn&apos;t effort. It&apos;s structure. The system that carried you to ten units was
        never really a system at all. It was you.
      </p>

      <h2>The first ten units run on memory</h2>
      <p>
        At two or three properties, you hold the entire operation in your head. You know whose
        lease ends in March, who paid late last month, which boiler is overdue a service, and
        which owner likes a call before the statement lands. Your phone, a spreadsheet and your
        memory are enough — because the volume is small enough that nothing falls through.
      </p>
      <p>
        This works astonishingly well, right up until it doesn&apos;t. The capacity of a
        memory-based system is fixed. It scales with you, not with the portfolio. Add a property
        and you don&apos;t add a manager — you add load to the same single point of failure.
      </p>

      <h2>What actually breaks first</h2>
      <p>
        The breakdown is rarely dramatic. No single catastrophe announces it. Instead, five
        quiet failures compound at once:
      </p>
      <ul>
        <li>
          <strong>Follow-ups disappear.</strong> A tenant reports a leak on Saturday. You mean to
          call the plumber Monday. By Wednesday it&apos;s buried under twenty newer messages — and
          you only remember when the tenant chases, annoyed.
        </li>
        <li>
          <strong>Nobody owns the next step.</strong> The contractor is waiting on the owner&apos;s
          approval. The owner thinks you&apos;re handling it. You think the contractor will chase.
          Work stalls in the gap between people.
        </li>
        <li>
          <strong>Deadlines stop being visible.</strong> Lease expiries, insurance renewals and
          compliance certificates don&apos;t announce themselves. At three units you remember them.
          At twelve you don&apos;t — and a lapsed certificate is a fine, not an inconvenience.
        </li>
        <li>
          <strong>Money tracking lags reality.</strong> You&apos;re no longer sure, at a glance, who
          is in arrears. You find out when you reconcile the bank statement — which is to say,
          too late to act early.
        </li>
        <li>
          <strong>Reporting becomes a project.</strong> An owner asks how their property did last
          month and you need an hour, a bank statement and three browser tabs to answer. Every
          single time.
        </li>
      </ul>
      <p>
        None of these is fatal alone. Together, they turn a calm operation into constant
        firefighting — reacting to whoever shouted loudest most recently, rather than working
        from a clear picture of what needs attention.
      </p>

      <h2>Why ten is the magic number</h2>
      <p>
        Ten isn&apos;t a hard rule — some operators wobble at seven, disciplined ones stretch to
        fifteen. But the threshold exists for a structural reason. Below it, the number of moving
        parts is small enough that one person can hold them all. Above it, the parts multiply
        faster than attention can.
      </p>
      <p>
        Each unit isn&apos;t one thing to track. It&apos;s a tenant, a lease, a rent schedule, a deposit,
        a set of recurring expenses, an insurance policy, a maintenance history and an owner
        relationship. Ten units is comfortably over seventy live obligations, each with its own
        clock. Memory simply can&apos;t hold seventy clocks.
      </p>

      <TrialCTA headline="At ten units, the question stops being 'how hard do I work?' and becomes 'what's doing the remembering?'" />

      <h2>The fix isn&apos;t more discipline — it&apos;s a shared operational layer</h2>
      <p>
        The instinct, when things slip, is to try harder: be more organised, check the
        spreadsheet more often, reply faster. This rarely works, because the problem isn&apos;t your
        diligence. It&apos;s that the operation lives in your head and your head has no overflow.
      </p>
      <p>
        What replaces memory is a single place where the state of every property is visible and
        the system — not you — keeps watch. Concretely, that means:
      </p>
      <ul>
        <li>
          <strong>One prioritised view of what needs attention today</strong> — overdue rent,
          expiring leases, open maintenance, pending approvals — so you start the day knowing
          where to look instead of scrolling chat history.
        </li>
        <li>
          <strong>Every issue tracked as a case with an owner and a status</strong>, so work never
          stalls silently in the gap between people.
        </li>
        <li>
          <strong>Automatic monitoring of every deadline</strong> — the system flags the lease
          expiry and the lapsing certificate before they bite, even when you&apos;re busy.
        </li>
        <li>
          <strong>Live financials and one-click owner reporting</strong>, so answering an owner
          takes thirty seconds, not an hour.
        </li>
      </ul>

      <h2>How to tell you&apos;re hitting the wall</h2>
      <p>
        You don&apos;t need ten units to feel this. The signals usually show up earlier:
      </p>
      <ul>
        <li>You&apos;ve been surprised that a tenant was in arrears.</li>
        <li>You&apos;ve missed or scrambled a lease renewal.</li>
        <li>An owner&apos;s simple question takes you more than five minutes to answer.</li>
        <li>You rely on remembering to follow things up — and sometimes don&apos;t.</li>
        <li>If you took a two-week holiday, nobody could run the portfolio from your notes.</li>
      </ul>
      <p>
        That last one is the clearest test. A system you can hand over is a system. A system only
        you can run is a job — and jobs have a ceiling.
      </p>

      <h2>Ten units is a milestone, not a ceiling</h2>
      <p>
        The landlords who push past ten units without the wheels coming off aren&apos;t working
        harder than everyone else. They&apos;ve simply moved the operation out of their heads and
        into something that scales with the portfolio instead of with them. Once the remembering
        is handled, adding the eleventh unit feels like the third did.
      </p>
      <p>
        The breakdown at ten units isn&apos;t a sign you&apos;ve reached your limit. It&apos;s a sign
        you&apos;ve outgrown running the operation on memory — and that&apos;s a problem you solve once.
      </p>
    </BlogPostLayout>
  );
}
