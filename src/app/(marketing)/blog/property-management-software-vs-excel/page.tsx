import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "property-management-software-vs-excel")!;

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
        Excel isn&apos;t the problem. Scale is.
      </p>
      <p>
        A well-built spreadsheet can handle a small portfolio — one or two properties with stable
        tenants. You know the rows, you trust the formulas, and you can find what you need in
        under a minute. It works because you&apos;re the system. Your memory, your habits, your
        discipline fill the gaps the spreadsheet can&apos;t.
      </p>
      <p>
        The problem is that this approach doesn&apos;t scale with the properties. It scales with you.
        And you have a fixed amount of time.
      </p>

      <h2>What actually breaks in Excel at 3+ properties</h2>
      <p>
        The failure mode isn&apos;t dramatic. It&apos;s gradual. One property becomes three. Three becomes
        five. Each one adds a new tab, a new formula, a new manual process. And then:
      </p>
      <ul>
        <li>
          <strong>Version control disappears.</strong> You have three versions of the spreadsheet:
          the one on your laptop, the one in Google Drive, and the one you emailed yourself last
          month. You&apos;re not sure which is current. Neither are the figures.
        </li>
        <li>
          <strong>No automation.</strong> Rent was due on the 1st. The spreadsheet doesn&apos;t know
          that. It doesn&apos;t flag that Unit 4 hasn&apos;t paid. It just holds the data you give it —
          and only if you remember to enter it.
        </li>
        <li>
          <strong>Formula errors compound.</strong> You copy a row for a new tenant and the formula
          references the wrong column. The error propagates silently for two months before you
          notice the totals are wrong. By then, you&apos;re reconciling from bank statements — not
          the spreadsheet.
        </li>
        <li>
          <strong>No mobile access.</strong> A maintenance job comes in on Saturday morning while
          you&apos;re on site. You&apos;ll update the spreadsheet later. You don&apos;t. The job goes unlogged
          and eventually unresolved.
        </li>
        <li>
          <strong>Reporting is always a project.</strong> An owner asks for last month&apos;s statement.
          You spend an hour building it from bank statements, the expense tab, and memory. Every
          single time.
        </li>
      </ul>

      <h2>What dedicated software does that Excel can&apos;t</h2>
      <p>
        Property management software isn&apos;t just a better spreadsheet. It&apos;s a different category
        of tool — one that acts on your data rather than just storing it.
      </p>

      <TrialCTA headline="Your spreadsheet stores data. Your management system should act on it." />

      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Excel</th>
            <th>Groundwork PM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Track who has and hasn&apos;t paid rent</td>
            <td>Manual — cross-reference bank statement and tenant list</td>
            <td>Automatic — arrears view shows outstanding invoices in real time</td>
          </tr>
          <tr>
            <td>Generate tenant invoice</td>
            <td>Build from template, email manually</td>
            <td>Generated per tenant per month, PDF download or send</td>
          </tr>
          <tr>
            <td>View net profit per property</td>
            <td>Manually calculate income minus expenses per tab</td>
            <td>Live P&amp;L dashboard per property</td>
          </tr>
          <tr>
            <td>Log a maintenance job</td>
            <td>Add a row to a sheet — if you remember</td>
            <td>Job logged, assigned, tracked, costed</td>
          </tr>
          <tr>
            <td>Produce owner report</td>
            <td>Build from scratch each month (30–90 min)</td>
            <td>One-click PDF generated from existing data</td>
          </tr>
          <tr>
            <td>Access on mobile</td>
            <td>Limited — edits are risky on small screens</td>
            <td>Full access via installable PWA</td>
          </tr>
          <tr>
            <td>Lease expiry alerts</td>
            <td>None — you check manually</td>
            <td>Automatic alert when lease is 30 or 60 days from expiry</td>
          </tr>
          <tr>
            <td>Multi-currency</td>
            <td>Manual conversion, prone to error</td>
            <td>Native support for KES, USD, GBP, EUR, AED and more</td>
          </tr>
        </tbody>
      </table>

      <h2>When to make the switch</h2>
      <p>
        You don&apos;t need to switch the moment you&apos;re frustrated with Excel. You need to switch when
        the cost of staying on Excel — in missed rent, wasted time, and poor decisions — exceeds
        the cost of moving. For most landlords, that threshold hits at 3–5 properties.
      </p>
      <p>
        The clearest signal is reporting. If you can&apos;t tell an owner what their net return was
        last month in under 5 minutes, your system isn&apos;t working. The data exists — it just isn&apos;t
        structured in a way that surfaces it automatically.
      </p>
      <p>
        The second signal is arrears. If you&apos;ve ever been surprised that a tenant is behind —
        if it took you a bank statement review to realise someone hadn&apos;t paid — your tracking
        isn&apos;t proactive enough. A proper system tells you before you think to look.
      </p>
      <p>
        Excel is a tool. For one or two properties, it&apos;s a perfectly good tool. But a growing
        portfolio isn&apos;t a spreadsheet problem. It&apos;s a systems problem — and the right tool for
        a systems problem is a system.
      </p>
    </BlogPostLayout>
  );
}
