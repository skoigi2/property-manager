import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "real-reason-landlords-miss-rent-payments")!;

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
        When rent goes missing, the easy story is that the tenant is at fault — they&apos;re
        unreliable, they&apos;re short this month, they&apos;re avoiding you. Sometimes that&apos;s true. But
        across a portfolio, most missed rent isn&apos;t a tenant problem at all. It&apos;s a tracking
        problem. The money was payable, often even paid, and the landlord&apos;s system simply lost
        the thread.
      </p>
      <p>
        That&apos;s an uncomfortable idea, because it moves the responsibility back to the operation.
        But it&apos;s also good news: a tracking problem is something you can fix, completely, and
        keep fixed.
      </p>

      <h2>The real reasons rent slips through</h2>

      <h3>1. There&apos;s no single source of truth for who owes what</h3>
      <p>
        Rent expectations live in one place, payments land in another (the bank), and the
        reconciliation between them lives in your head or a spreadsheet you update when you
        remember. With three tenants you can hold the gaps. With fifteen you can&apos;t. Nobody
        decided to let a payment slide — there was just no single view showing that it had.
      </p>

      <h3>2. Chasing is reactive instead of proactive</h3>
      <p>
        In most small operations, a late payment is noticed only when the landlord happens to look
        — often days or weeks after the due date. By then the conversation is awkward and the
        arrears have grown. A missed payment caught on day two is a friendly reminder. The same
        payment caught on day twenty is a problem. The difference isn&apos;t the tenant; it&apos;s when the
        system told you.
      </p>

      <h3>3. Reconciliation lags reality</h3>
      <p>
        Two quiet failure modes hide here. A tenant pays, but you don&apos;t record it for a week — so
        your records show arrears that don&apos;t exist, and you chase someone who paid. Or you mark
        an invoice paid in advance and the money never actually arrives. Either way, the record and
        the bank disagree, and the gap is where income gets lost.
      </p>

      <h3>4. Part-payments disappear</h3>
      <p>
        A tenant pays half this month and promises the rest. In a binary &quot;paid / not paid&quot;
        spreadsheet, that doesn&apos;t fit cleanly, so it gets noted in a margin, a message, or not at
        all. The outstanding balance quietly drops off the radar and is never collected.
      </p>

      <h3>5. There&apos;s no escalation process, so arrears drift</h3>
      <p>
        Without a defined sequence — reminder, formal notice, follow-up — a late payment depends
        entirely on the landlord remembering to chase, again and again, on top of everything else.
        Most don&apos;t, consistently. Arrears that should have been resolved in week one drift into
        months because nothing kept pushing them forward.
      </p>

      <h3>6. Invoicing itself is manual and late</h3>
      <p>
        If invoices go out only when you get around to it, payment is late before the tenant has
        done anything wrong. An inconsistent ask produces inconsistent payment. The pattern starts
        on the landlord&apos;s side.
      </p>

      <TrialCTA headline="Most missed rent was payable, trackable, and collectable. The gap wasn't the tenant — it was the system that lost it." />

      <h2>What a missed week actually costs</h2>
      <p>
        It&apos;s tempting to treat a late payment as a timing nuisance rather than a real loss. But
        arrears that aren&apos;t caught early have a way of becoming arrears that aren&apos;t caught at all.
        A part-payment never reconciled, a tenant who leaves still owing, a balance you can&apos;t
        evidence in a dispute — these are permanent losses that began as a small tracking gap.
        Across a portfolio and a year, the total is rarely trivial.
      </p>

      <h2>Building a collection system that doesn&apos;t depend on you</h2>
      <p>
        The fix isn&apos;t chasing harder. It&apos;s removing yourself as the single point of failure in
        the collection process. A system that reliably captures rent has a few non-negotiable
        parts:
      </p>
      <ul>
        <li>
          <strong>One live view of who owes what.</strong> Every tenant, every invoice, every
          outstanding balance in one place — so arrears are visible the moment they occur, not the
          week you reconcile.
        </li>
        <li>
          <strong>Payments matched to invoices.</strong> When rent is recorded against the invoice
          it pays, the record and reality stay in sync, and part-payments leave a visible remaining
          balance instead of vanishing.
        </li>
        <li>
          <strong>Proactive flags, not manual checks.</strong> The system surfaces an overdue
          invoice on day one or two, so a gentle reminder goes out while it&apos;s still gentle.
        </li>
        <li>
          <strong>A defined escalation path.</strong> Reminder, formal notice, follow-up — tracked
          as stages so nothing drifts because you forgot to chase.
        </li>
        <li>
          <strong>Consistent, automatic invoicing.</strong> The ask goes out on the same day every
          month without you remembering, so payment timing stays predictable.
        </li>
      </ul>

      <h2>Stop blaming the tenant and check the system</h2>
      <p>
        Some tenants genuinely won&apos;t pay, and for those you need a clear, evidenced escalation
        process — which a good system also gives you. But before reaching for that explanation, it
        is worth asking the harder question: did the operation actually give this payment its best
        chance of being collected on time?
      </p>
      <p>
        For most missed rent, the honest answer is no — not because anyone was careless, but
        because the tracking ran on memory and the memory had too much to hold. Fix the system, and
        a surprising amount of &quot;tenant&quot; rent problems simply stop happening.
      </p>
    </BlogPostLayout>
  );
}
