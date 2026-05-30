import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "why-spreadsheets-feel-fine-until-they-dont")!;

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
        Here&apos;s the strange thing about spreadsheets in property management: they don&apos;t get
        gradually worse. They feel completely fine — genuinely, reliably fine — and then one day
        they don&apos;t, usually at the worst possible moment. There&apos;s rarely a warning. The
        breakdown feels sudden because of how spreadsheets actually fail.
      </p>

      <h2>Why they feel fine at the start</h2>
      <p>
        A spreadsheet for one or two properties is a great tool. You built it, so you know exactly
        where everything lives. The formulas are simple enough to trust. You can scan the whole
        thing in a glance and spot anything wrong. It&apos;s fast, it&apos;s free, and it bends to whatever
        you need.
      </p>
      <p>
        Crucially, it feels fine because <em>you</em> are quietly doing half the work. You remember
        that rent is due on the 1st. You notice when a figure looks off. You know that the
        &quot;2,400&quot; in cell D7 is provisional. The spreadsheet holds the numbers; you hold the
        meaning. At small scale, that partnership is invisible and effortless.
      </p>

      <h2>The cracks form silently</h2>
      <p>
        As the portfolio grows, the spreadsheet doesn&apos;t announce strain. It keeps opening, keeps
        calculating, keeps looking fine. But underneath, small fractures accumulate where nobody can
        see them:
      </p>
      <ul>
        <li>
          A formula copied for a new tenant references the wrong cell. The total is now subtly
          wrong, and nothing flags it.
        </li>
        <li>
          A second version exists — one on your laptop, one in the cloud — and they&apos;ve drifted
          apart. Both look authoritative.
        </li>
        <li>
          A rent payment was received but never entered, because you were on site that day. The
          sheet now disagrees with reality.
        </li>
        <li>
          A deposit figure is out of date. A lease end was never updated after a renewal. A column
          means something different than it did a year ago.
        </li>
      </ul>
      <p>
        Each of these is harmless in isolation and invisible day to day. The spreadsheet still
        feels fine because none of these errors do anything — until something asks them to.
      </p>

      <h2>Then a trigger event arrives</h2>
      <p>
        The breakdown isn&apos;t caused by the spreadsheet degrading. It&apos;s caused by an event that
        suddenly demands all of it be correct at once:
      </p>
      <ul>
        <li>
          <strong>An owner asks for a full year&apos;s reconciliation.</strong> Now every silent
          formula error and missing entry surfaces together, and you&apos;re rebuilding from bank
          statements at 11pm.
        </li>
        <li>
          <strong>A deposit dispute goes formal.</strong> You need a clean, dated history — and the
          spreadsheet has totals, not evidence.
        </li>
        <li>
          <strong>You take on three more units.</strong> The manual process that just about coped
          tips over, and the gaps you were covering with memory become visible.
        </li>
        <li>
          <strong>Someone else needs to use it.</strong> A partner or assistant opens the file and
          can&apos;t tell what&apos;s current, what&apos;s provisional, or which tab matters.
        </li>
        <li>
          <strong>You go on holiday.</strong> Two weeks later, nothing was tracked, because the
          spreadsheet only worked when you were feeding it daily.
        </li>
      </ul>

      <TrialCTA headline="Spreadsheets don't fail gradually. They hold latent errors until one event asks for all of it to be right at once." />

      <h2>Why it feels so sudden</h2>
      <p>
        The suddenness is the whole point. Spreadsheet failures are <em>latent</em> — they sit
        harmlessly in the file until a trigger event forces a reckoning. Because the errors
        accumulated silently and surfaced all together, it feels like the tool broke overnight.
      </p>
      <p>
        It didn&apos;t. It was quietly drifting for months. You just never had a reason to look closely
        until the moment you couldn&apos;t afford to find a problem — and found several.
      </p>

      <h2>The fix isn&apos;t a better spreadsheet</h2>
      <p>
        The instinct after a bad reckoning is to rebuild the spreadsheet better: lock the formulas,
        add validation, keep one master copy. This buys time, but it doesn&apos;t change the underlying
        dynamic. A spreadsheet is a passive store of numbers that depends on you for accuracy,
        memory and meaning. Make it fancier and it&apos;s still passive.
      </p>
      <p>
        What removes the cliff is a tool that actively maintains its own correctness:
      </p>
      <ul>
        <li>
          Rent recorded against the invoice it pays, so arrears are visible the day they happen —
          no silent gap between reality and the record.
        </li>
        <li>
          Deadlines the system watches for you, so a renewal or expiry can&apos;t quietly fall out of
          date.
        </li>
        <li>
          A full, dated history of every tenant, payment and job — evidence on demand, not totals
          you have to defend.
        </li>
        <li>
          Reports generated from live data, so a year-end reconciliation is a click, not an
          archaeology project.
        </li>
      </ul>

      <h2>You don&apos;t have to wait for the cliff</h2>
      <p>
        The honest signal to switch isn&apos;t frustration — it&apos;s risk. If your operation would be
        exposed by a sudden demand for accuracy — an audit, a dispute, a handover, a growth spurt —
        then the spreadsheet only feels fine because that demand hasn&apos;t arrived yet.
      </p>
      <p>
        Spreadsheets are excellent at small scale and quietly dangerous beyond it. The danger
        isn&apos;t that they&apos;ll fail loudly. It&apos;s that they&apos;ll keep feeling fine right up until the
        day they very much aren&apos;t — and you don&apos;t get to choose which day that is.
      </p>
    </BlogPostLayout>
  );
}
