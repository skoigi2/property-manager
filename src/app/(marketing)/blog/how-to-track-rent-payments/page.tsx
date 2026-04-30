import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "how-to-track-rent-payments")!;

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
        Missed rent isn&apos;t always the tenant&apos;s fault. Sometimes the landlord simply loses track.
      </p>
      <p>
        A partial payment comes in. You note it somewhere — a spreadsheet, a text message, a
        mental note. Two weeks later you&apos;re not sure if the balance was ever paid. You check the
        bank statement. You cross-reference the tenant list. Twenty minutes later you&apos;re still not
        certain whether they owe you £150 or you already received it and recorded it in the wrong
        column.
      </p>
      <p>
        This isn&apos;t a tenant problem. It&apos;s a tracking problem. And it gets worse with every
        property you add.
      </p>

      <h2>Where rent tracking breaks down</h2>
      <p>
        Most landlords track rent in one of three ways: a bank statement, a spreadsheet, or their
        memory. All three fail in the same direction — they tell you what happened, not what should
        have happened.
      </p>
      <ul>
        <li>
          <strong>No unified ledger.</strong> Rent from four tenants comes into the same bank account.
          Unless every payment is immediately tagged and attributed to a specific tenant and month,
          the numbers blur. A £1,200 payment — is that full rent for Unit 3, or a partial for Unit 1?
        </li>
        <li>
          <strong>Partial payments don&apos;t get recorded properly.</strong> Tenant pays £800 of a
          £1,200 rent. You note it. The follow-up for the £400 gets missed. Two months later, the
          tenant is £800 behind and believes they&apos;re current because you never chased them.
        </li>
        <li>
          <strong>Deposits mixed with rent.</strong> The deposit is sitting in the same column as
          monthly rent. Your income figures are wrong. Your net profit is wrong. At tax time, you
          spend hours untangling it.
        </li>
        <li>
          <strong>Month-end confusion.</strong> You know rent was &quot;roughly paid&quot; last month but
          you can&apos;t produce an exact figure for the owner. You spend an hour rebuilding what a
          proper system would show you in seconds.
        </li>
      </ul>

      <h2>What proper rent tracking looks like</h2>
      <p>
        A rent tracking system does four things that a bank statement and spreadsheet cannot:
      </p>
      <ol>
        <li>
          <strong>Issues invoices automatically.</strong> At the start of each month, every tenant
          has an invoice generated for the amount owed. The system knows what to expect before
          any payment arrives.
        </li>
        <li>
          <strong>Records payments against specific invoices.</strong> When £1,200 arrives, it&apos;s
          logged against Unit 3&apos;s March invoice — not into a general income column. Partial
          payments are recorded against the same invoice, showing an outstanding balance.
        </li>
        <li>
          <strong>Surfaces arrears automatically.</strong> Any invoice that&apos;s unpaid or partially
          paid past its due date appears in an arrears view — without you checking anything. The
          system tells you what&apos;s overdue; you don&apos;t have to find it.
        </li>
        <li>
          <strong>Keeps deposits separate.</strong> Deposits are recorded as a distinct entry type,
          excluded from income calculations, and tracked separately so they never distort your
          monthly figures.
        </li>
      </ol>

      <TrialCTA headline="Stop losing track of rent. Let the system tell you what&apos;s overdue." />

      <h2>The rent tracking workflow, step by step</h2>

      <h3>Step 1: Set rent amounts per tenant</h3>
      <p>
        Each tenant should have a recorded monthly rent amount, lease start date, and payment due
        date. This is the baseline the system uses to know what to expect each month. Without it,
        you&apos;re tracking payments with no reference point for what was owed.
      </p>

      <h3>Step 2: Generate invoices at the start of each month</h3>
      <p>
        Rather than waiting for payments to arrive, generate invoices at the start of each period.
        This creates a clear record of what is expected — before anything is paid. It also gives
        you something to send to the tenant as a formal payment reminder.
      </p>
      <p>
        In Groundwork PM, invoices can be generated individually or for all tenants at once.
        Each invoice is linked to the specific tenant, unit, and month it covers.
      </p>

      <h3>Step 3: Record every payment immediately</h3>
      <p>
        The moment a payment arrives — in your bank account, via mobile money, or in cash — log it
        against the correct invoice. Don&apos;t batch it for the end of the week. Immediate recording is
        the difference between a system that tells you what&apos;s outstanding and one that&apos;s always
        slightly behind.
      </p>
      <p>
        If it&apos;s a partial payment, log the amount received. The system will show the invoice as
        partially paid and calculate the outstanding balance automatically.
      </p>

      <h3>Step 4: Review arrears weekly</h3>
      <p>
        Once recording is consistent, arrears tracking takes minutes, not hours. At any point,
        you can see a list of all unpaid or partially paid invoices, sorted by how overdue they are.
        This is the information you need to decide who to chase and when — without any manual
        cross-referencing.
      </p>

      <h3>Step 5: Reconcile at month-end</h3>
      <p>
        At the end of each month, your total rent collected should match your bank statement.
        If it doesn&apos;t, the discrepancy is visible — either an unrecorded payment or an entry
        against the wrong tenant. Month-end reconciliation becomes a 10-minute check rather than
        a half-day exercise.
      </p>

      <h2>The compounding cost of poor tracking</h2>
      <p>
        Tracking rent properly isn&apos;t just about knowing who&apos;s paid. It&apos;s about catching problems
        early — before a tenant is three months behind and believes there&apos;s no issue because
        nobody told them otherwise.
      </p>
      <p>
        Every week a payment goes unnoticed is a week harder to collect. And every month of
        confusion at reconciliation time is compounded by the next month&apos;s incoming payments
        layering on top of unresolved balances.
      </p>
      <p>
        A system that tracks rent properly doesn&apos;t just save you time. It stops small arrears
        from becoming large ones — which is where the real money is.
      </p>
    </BlogPostLayout>
  );
}
