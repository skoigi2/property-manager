import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "run-rental-properties-like-a-business")!;

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
        The landlords who scale don&apos;t work harder. They build systems.
      </p>
      <p>
        There&apos;s a version of property management that looks like this: constant firefighting.
        Chasing rent. Fielding maintenance messages at 9pm. Rebuilding owner reports from scratch
        every month. Never quite sure if the numbers are right. Always slightly behind.
      </p>
      <p>
        And there&apos;s another version: a portfolio that runs predictably. Payments tracked
        automatically. Maintenance logged and resolved. Reports generated in seconds. Lease
        renewals handled before anyone has to ask.
      </p>
      <p>
        The difference isn&apos;t the number of properties. It&apos;s the presence or absence of systems.
      </p>

      <h2>Reactive vs proactive property management</h2>
      <p>
        Most landlords operate reactively. Something goes wrong, they fix it. Rent doesn&apos;t come
        in, they chase it. A lease expires, they notice. This approach works until it doesn&apos;t —
        and when it stops working, it&apos;s usually several problems arriving at once.
      </p>
      <p>
        Running properties like a business means operating proactively. You know what&apos;s coming
        before it arrives. Lease renewals are handled 60 days out, not the day after the lease
        ends. Arrears are surfaced weekly, not when the tenant is three months behind. Maintenance
        jobs have statuses and owners — they don&apos;t live in a WhatsApp thread waiting to be
        forgotten.
      </p>
      <p>
        This shift doesn&apos;t require more time. It requires better information — and a system that
        surfaces it without you having to hunt for it.
      </p>

      <h2>The 5 systems every landlord needs</h2>

      <h3>1. Rent tracking</h3>
      <p>
        Rent tracking isn&apos;t just recording payments. It&apos;s knowing — at any point in the month —
        what was expected, what arrived, and what&apos;s outstanding. A proper rent tracking system
        issues invoices, records payments against specific tenants and months, flags overdue
        balances automatically, and keeps deposits completely separate from income.
      </p>
      <p>
        In Groundwork PM, every tenant has an invoice ledger. Partial payments are tracked
        against the invoice they belong to. Arrears are visible without any manual review.
      </p>

      <h3>2. Expense management</h3>
      <p>
        Every cost should be logged, categorised, and linked to the correct property. Not thrown
        into a general "expenses" column. When your repair costs, management fees, insurance, and
        utilities are properly categorised, you can answer questions that matter: what did I
        spend on repairs at Property B last quarter? What&apos;s my expense ratio across the portfolio?
        Is this property still profitable after maintenance?
      </p>
      <p>
        These aren&apos;t abstract accounting questions. They&apos;re the questions that determine whether
        you hold, sell, or expand.
      </p>

      <h3>3. Maintenance management</h3>
      <p>
        Every maintenance job should exist as a record with a status, an assigned contractor,
        and a logged cost when resolved. Not a WhatsApp message. Not a screenshot. A job with
        a clear owner and a clear status.
      </p>
      <p>
        This matters for three reasons: nothing gets missed, your repair history is searchable,
        and your maintenance costs flow automatically into your expense records. One entry does
        three jobs.
      </p>

      <TrialCTA headline="Build the systems that let your portfolio run without you in the middle of everything." />

      <h3>4. Reporting</h3>
      <p>
        If producing a monthly owner report takes more than 10 minutes, your system isn&apos;t working.
        Every figure in that report — gross income, expenses, net profit, maintenance costs —
        should come from data you&apos;ve already entered to run the portfolio day-to-day. The report
        shouldn&apos;t be a new piece of work. It should be a formatted view of existing data.
      </p>
      <p>
        In Groundwork PM, owner reports and P&amp;L statements are generated from the income and
        expense entries already in the system. When you log income and expenses consistently,
        reporting takes seconds.
      </p>

      <h3>5. Lease and compliance management</h3>
      <p>
        Leases expire. Insurance policies lapse. Maintenance certificates need renewing. None of
        these should catch you by surprise — but they do when you&apos;re relying on memory or a
        calendar entry buried under other tasks.
      </p>
      <p>
        A system that tracks lease end dates, flags renewals 60 days out, and monitors compliance
        expiry removes the cognitive load of remembering what needs to happen and when. You get
        an alert. You act. The problem doesn&apos;t escalate.
      </p>

      <h2>The business mindset: data drives decisions</h2>
      <p>
        Running properties like a business means making decisions based on data — not gut feel.
        Which property has the highest expense ratio? Which unit has the most maintenance issues?
        Which tenant consistently pays late? Is this property generating the return I expected?
      </p>
      <p>
        These questions are unanswerable from a spreadsheet unless you&apos;ve spent hours building
        the analysis. From a proper management system, they&apos;re answered by opening the dashboard.
      </p>
      <p>
        The goal isn&apos;t to work harder. It&apos;s to build a system where the portfolio runs
        predictably — where problems surface early, where information is always current, and
        where you spend your time making decisions rather than hunting for the data to make them.
      </p>
      <p>
        That&apos;s the difference between managing properties and running a property business.
      </p>
    </BlogPostLayout>
  );
}
