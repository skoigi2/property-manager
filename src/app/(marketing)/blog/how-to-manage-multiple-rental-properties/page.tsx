import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "how-to-manage-multiple-rental-properties")!;

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
        At two properties, a spreadsheet works fine. You know which tenant is in which unit,
        when rent is due, and roughly what you spent on repairs last month. It&apos;s manageable — just.
      </p>
      <p>
        At five properties, things start slipping. A payment comes in but you&apos;re not sure which
        unit it&apos;s for. A maintenance request gets buried in WhatsApp. You try to calculate your
        net profit for the quarter and realise you&apos;ve mixed deposits with rent in the same column.
      </p>
      <p>
        At ten properties, the spreadsheet isn&apos;t a management tool anymore — it&apos;s just a log of
        things that went wrong.
      </p>
      <p>
        This isn&apos;t a failure of effort. It&apos;s a failure of system. Spreadsheets were never designed
        to manage portfolios. Here&apos;s what a system that actually scales looks like.
      </p>

      <h2>Why spreadsheets break at scale</h2>
      <p>
        The core problem with spreadsheets is that they are passive. They record what you tell them
        and do nothing else. A proper property management system is active — it surfaces what you
        need to act on before things go wrong.
      </p>
      <p>Here&apos;s where spreadsheets typically collapse:</p>
      <ul>
        <li>
          <strong>Missed rent.</strong> You&apos;re manually checking dates and cross-referencing bank
          statements. One busy week and you miss a payment. By the time you notice, the tenant is
          two months behind and thinks you agreed to a payment plan.
        </li>
        <li>
          <strong>No per-unit visibility.</strong> Your spreadsheet shows total income across all
          properties. But which unit is actually profitable? Which one is eating your margin with
          repairs? You don&apos;t know without hours of analysis.
        </li>
        <li>
          <strong>Maintenance chaos.</strong> Tenant messages WhatsApp. You screenshot it. You
          forget to call the plumber. Tenant follows up two weeks later. You apologise. This loop
          repeats every month.
        </li>
        <li>
          <strong>Report-time panic.</strong> An owner asks for a monthly statement. You spend
          half a day rebuilding it from bank statements and receipts. Every time.
        </li>
      </ul>

      <h2>What a proper management system actually tracks</h2>
      <p>
        A system that scales tracks five things automatically — things you currently have to track
        manually or guess at:
      </p>
      <ol>
        <li><strong>Income per unit</strong> — what&apos;s been paid, what&apos;s outstanding, what&apos;s overdue</li>
        <li><strong>Expenses per property</strong> — categorised, searchable, linked to receipts</li>
        <li><strong>Maintenance jobs</strong> — logged, assigned, statused, and linked to costs</li>
        <li><strong>Tenant records</strong> — lease dates, rent amounts, renewal status, documents</li>
        <li><strong>Owner reports</strong> — generated automatically from the above</li>
      </ol>
      <p>
        When all five are connected, managing ten properties takes roughly the same effort as
        managing two — because the system is doing the tracking, not you.
      </p>

      <TrialCTA headline="Stop rebuilding your management system every month." />

      <h2>The step-by-step system for multiple properties</h2>

      <h3>Step 1: Set up each property with its own record</h3>
      <p>
        Every property should have a dedicated record with its address, property type, currency,
        and unit list. Don&apos;t lump everything together. The goal is to be able to pull up Property
        B&apos;s financials in 10 seconds without sorting through a shared spreadsheet.
      </p>
      <p>
        In Groundwork PM, each property is created with its own units, and all income, expenses,
        and maintenance are scoped to that property. Switch between properties in one click.
      </p>

      <h3>Step 2: Add tenants and set lease terms</h3>
      <p>
        For each unit, record the tenant&apos;s name, email, monthly rent, lease start and end date,
        and deposit amount. These aren&apos;t just reference fields — they drive your arrears tracking,
        renewal alerts, and invoicing.
      </p>
      <p>
        A good system tells you 60 days before a lease expires. A spreadsheet tells you the day
        after the tenant moves out without notice.
      </p>

      <h3>Step 3: Log income as it comes in</h3>
      <p>
        Every payment should be recorded against a specific tenant and month. Not into a general
        income column — against the specific invoice or period it covers. This is what enables
        arrears tracking: the system knows what was expected, what arrived, and what&apos;s missing.
      </p>

      <h3>Step 4: Log expenses by category</h3>
      <p>
        Repairs, management fees, insurance, utilities — each expense should be categorised and
        linked to a property or unit. This is what makes end-of-quarter reporting a 30-second task
        instead of a half-day job.
      </p>

      <h3>Step 5: Log maintenance jobs immediately</h3>
      <p>
        The moment a tenant reports an issue, create a maintenance job. Assign it to a vendor,
        set a priority, and track its status. When it&apos;s resolved, log the cost against the property.
        Now your repair history is searchable and your expense records are accurate.
      </p>

      <h3>Step 6: Run reports on demand</h3>
      <p>
        With the above in place, your monthly P&amp;L, owner statement, and occupancy report should
        generate in seconds — not hours. If you&apos;re still spending time building reports, your
        system isn&apos;t working hard enough.
      </p>

      <h2>The mindset shift: data entry is not overhead — it&apos;s your management system</h2>
      <p>
        The reason landlords resist moving off spreadsheets is usually the same: "I don&apos;t want
        more admin." But recording a payment or logging a maintenance job in a proper system takes
        the same time as doing it in a spreadsheet — and it does ten times more with that data.
      </p>
      <p>
        The overhead isn&apos;t the entry. It&apos;s the manual work that happens every time you need to
        find something, report something, or figure out why the numbers don&apos;t add up. That&apos;s where
        the hours go. A proper system eliminates that work, not adds to it.
      </p>
      <p>
        Managing multiple properties without spreadsheets isn&apos;t about doing more — it&apos;s about
        building a system that works whether you&apos;re checking in daily or coming back after a
        two-week holiday.
      </p>
    </BlogPostLayout>
  );
}
