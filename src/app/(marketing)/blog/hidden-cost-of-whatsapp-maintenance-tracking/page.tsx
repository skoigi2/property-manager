import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "hidden-cost-of-whatsapp-maintenance-tracking")!;

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
        WhatsApp feels free. The tenant has it, the contractor has it, you have it, and a repair
        request is one message away. For a landlord with a couple of properties, it genuinely is
        the fastest tool available. That&apos;s exactly why it&apos;s so hard to give up.
      </p>
      <p>
        But &quot;free&quot; is only the price you can see. Run maintenance through WhatsApp across a
        real portfolio and a second bill quietly accumulates — paid in lost jobs, slow responses,
        leaked spend and eroded trust. It never shows up as a line item, which is precisely why
        it&apos;s so expensive.
      </p>

      <h2>Cost 1: The jobs that simply vanish</h2>
      <p>
        A chat thread has no concept of an open job. A leak reported at 9pm on Friday is, by
        Monday, twenty messages up the screen — sandwiched between a rent query, a photo of a
        parking dispute and a voice note you haven&apos;t listened to. Nothing marks it as unresolved.
        Nothing surfaces it again. It exists only as long as you remember it.
      </p>
      <p>
        Most landlords can name a job that disappeared this way: small at first, ignored because
        it slid out of view, expensive by the time the tenant chased. A dripping seal becomes a
        damaged ceiling. A loose handle becomes a callout and a complaint. WhatsApp didn&apos;t lose
        the job maliciously — it just has no memory, and it made your memory the only safety net.
      </p>

      <h2>Cost 2: Nobody knows who owns the next step</h2>
      <p>
        Maintenance is a chain: tenant reports, manager triages, owner approves spend, contractor
        attends, invoice gets paid. In a chat, every handoff is ambiguous. The contractor is
        waiting on your approval. You&apos;re waiting on the owner. The owner assumed it was done. The
        tenant assumes everyone forgot — and sometimes they&apos;re right.
      </p>
      <p>
        Each day a job sits in one of these gaps is a day of tenant frustration and, often, a more
        expensive repair. The chat shows messages; it never shows status. And status is the only
        thing that tells you where work is stuck.
      </p>

      <h2>Cost 3: Slow response is a churn and repair-cost multiplier</h2>
      <p>
        Tenants forgive problems. They don&apos;t forgive being ignored. The single biggest driver of
        tenant dissatisfaction isn&apos;t that something broke — it&apos;s not knowing whether anyone is
        dealing with it. A maintenance process that runs on &quot;I&apos;ll get to it&quot; produces tenants
        who quietly decide not to renew, and that vacancy costs far more than the repair did.
      </p>
      <p>
        Slow response also compounds the physical problem. Damp, leaks and electrical faults get
        worse and more expensive the longer they wait. WhatsApp&apos;s lack of urgency isn&apos;t neutral —
        it actively inflates your repair bills.
      </p>

      <h2>Cost 4: Spend leaks because nothing is tracked against the property</h2>
      <p>
        When the approval, the invoice and the payment all live in a chat, the cost never reliably
        attaches to the property it belongs to. Come reporting time, you&apos;re reconstructing spend
        from messages and bank statements. Some costs get missed. Some get billed to the wrong
        owner. Margins leak in ways you can&apos;t see because the data was never structured.
      </p>
      <p>
        Multiply a handful of mis-tracked or forgotten costs across a year and a portfolio, and the
        &quot;free&quot; tool has quietly cost you real money — money you can&apos;t even quantify, because the
        record doesn&apos;t exist.
      </p>

      <TrialCTA headline="WhatsApp has no memory, no status, and no audit trail. For maintenance, those three gaps are the whole job." />

      <h2>Cost 5: You can&apos;t evidence anything later</h2>
      <p>
        Deposit disputes, owner disagreements and tenant complaints all come down to one question:
        can you show what happened, and when? A chat thread is technically a record, but try
        producing a clean history of one job from eighteen months of mixed messages. You can&apos;t.
        The evidence is there and unusable at the same time.
      </p>
      <p>
        A proper maintenance record — request, photos, approvals, attendance, cost, resolution,
        all on one timeline — turns a he-said-she-said into a closed matter in seconds. WhatsApp
        gives you the raw material and none of the structure.
      </p>

      <h2>Cost 6: Your attention, fragmented all day</h2>
      <p>
        The least visible cost is your own focus. Running maintenance through the same app you use
        for everything else means every repair competes with personal messages, and every notification
        pulls you back into reactive mode. You&apos;re never off, and you&apos;re never sure you&apos;ve caught
        everything. That low-grade anxiety is a tax you pay every single day.
      </p>

      <h2>What a real maintenance system does differently</h2>
      <p>
        The alternative isn&apos;t more complicated — it&apos;s more contained. Maintenance belongs in a
        system that does what a chat fundamentally can&apos;t:
      </p>
      <ul>
        <li>
          <strong>Every report becomes a tracked job</strong> with a status, so nothing relies on
          you remembering it exists.
        </li>
        <li>
          <strong>Each job has a clear owner of the next step</strong>, so work never stalls
          silently between the tenant, the contractor and the owner.
        </li>
        <li>
          <strong>Urgent issues surface to the top automatically</strong>, instead of being buried
          by newer chatter.
        </li>
        <li>
          <strong>Cost, approval and resolution attach to the property</strong>, so reporting is a
          by-product of the work, not a monthly excavation.
        </li>
        <li>
          <strong>The full history lives on one timeline</strong> — evidence you can actually use
          when an owner or tenant asks.
        </li>
      </ul>

      <h2>Keep the convenience, lose the cost</h2>
      <p>
        None of this means tenants should stop messaging you on WhatsApp — that convenience is
        real. It means the message should be the start of a tracked job, not the entire record of
        it. Let people reach you wherever they like; let the work itself live somewhere that
        remembers, prioritises and evidences it for you.
      </p>
      <p>
        WhatsApp was never a maintenance system. It just felt like one because the bill was
        hidden. The moment you can see the cost — in lost jobs, slow responses and leaked spend —
        the case for a real system makes itself.
      </p>
    </BlogPostLayout>
  );
}
