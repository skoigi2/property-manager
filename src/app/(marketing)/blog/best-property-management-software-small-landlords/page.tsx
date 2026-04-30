import type { Metadata } from "next";
import { BlogPostLayout, TrialCTA } from "@/components/blog/BlogPost";
import { BLOG_POSTS } from "@/lib/blog-posts";

const post = BLOG_POSTS.find((p) => p.slug === "best-property-management-software-small-landlords")!;

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
        Most property management software is built for companies running 200-unit apartment complexes
        with a full team of staff. The pricing reflects it. The complexity reflects it. And the features
        you actually need — clear income tracking, simple maintenance logs, a one-page report — are
        buried under modules you&apos;ll never open.
      </p>
      <p>
        If you&apos;re managing between 2 and 20 properties yourself, or with a small team, you need
        something fundamentally different. Not a scaled-down enterprise tool. A tool built for your
        actual situation.
      </p>
      <p>
        Here&apos;s what to look for — and what to avoid.
      </p>

      <h2>Why most property software doesn&apos;t work for small landlords</h2>
      <p>
        Enterprise property management platforms (AppFolio, Yardi, Buildium) are engineered for
        scale. At 500 units, you need bulk rent processing, staff permission layers, automated
        work-order routing, and integration with accounting systems. These are real problems — just
        not yours.
      </p>
      <p>
        For small landlords, these platforms create three specific issues:
      </p>
      <ul>
        <li>
          <strong>Overpaying for features you don&apos;t use.</strong> Enterprise plans typically start
          at $200–$400/month — often with per-unit fees on top. For a landlord with 5 properties,
          that cost is hard to justify when half the product sits unused.
        </li>
        <li>
          <strong>Complexity that slows you down.</strong> If it takes 20 minutes to learn how to
          record a rent payment, the software isn&apos;t helping you. It&apos;s adding friction. Small
          landlords need tools they can pick up and use immediately — not a 3-day onboarding process.
        </li>
        <li>
          <strong>No mobile access.</strong> You&apos;re not always at a desk. If you can&apos;t log a
          maintenance job or check arrears from your phone while you&apos;re on-site, the software
          doesn&apos;t fit your workflow.
        </li>
      </ul>

      <h2>What to actually look for</h2>
      <p>
        When evaluating property management software for a small portfolio, five things matter:
      </p>

      <h3>1. Income and expense tracking per property</h3>
      <p>
        At a minimum, you need to be able to see — for each individual property — what came in,
        what went out, and what the net position is. Not a combined total across all properties.
        Not a spreadsheet you export and manipulate. A live view, per property, at any point in
        the month.
      </p>
      <p>
        This sounds basic. Many tools still don&apos;t do it cleanly.
      </p>

      <h3>2. Arrears tracking without manual cross-referencing</h3>
      <p>
        The software should tell you who hasn&apos;t paid and how many days they&apos;re overdue — without
        you having to check a bank statement and compare it to a tenant list. Automatic arrears
        tracking is one of the highest-value features a small landlord can have, because missed
        rent is the most expensive thing that can go wrong.
      </p>

      <h3>3. Maintenance logs with vendor tracking</h3>
      <p>
        Every maintenance job should have a record: what the issue was, who was assigned, what
        it cost, and whether it&apos;s been resolved. Not a WhatsApp screenshot. Not a note in your
        phone. An actual log you can search and report on.
      </p>

      <h3>4. Reports you can send to owners</h3>
      <p>
        If you manage properties on behalf of owners, you need to be able to produce a clean
        monthly statement without spending an afternoon rebuilding it from scratch. Income, expenses,
        maintenance costs, and net return — generated automatically from the data you&apos;ve already
        entered.
      </p>

      <h3>5. Multi-currency support</h3>
      <p>
        If you manage properties in more than one country — or if your tenants pay in different
        currencies — the software needs to handle this natively. Currency conversion and manual
        tracking across currencies is a hidden source of errors for international landlords.
      </p>

      <TrialCTA headline="Built for landlords managing 2–20 properties. Not 200." />

      <h2>What Groundwork PM does differently</h2>
      <p>
        Groundwork PM was built specifically for independent landlords and small property managers.
        Not as a lite version of an enterprise platform — from the ground up for portfolios of
        2–50 properties.
      </p>
      <p>Here&apos;s how it maps to what small landlords actually need:</p>

      <table>
        <thead>
          <tr>
            <th>What you need</th>
            <th>Groundwork PM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Per-property income and expense view</td>
            <td>Dashboard per property, switch in one click</td>
          </tr>
          <tr>
            <td>Automatic arrears tracking</td>
            <td>Invoice ledger shows outstanding, overdue, and paid per tenant</td>
          </tr>
          <tr>
            <td>Maintenance log with vendor assignment</td>
            <td>Jobs logged, assigned, tracked, and costed</td>
          </tr>
          <tr>
            <td>Owner-ready monthly reports</td>
            <td>One-click PDF report with income, expenses, and net profit</td>
          </tr>
          <tr>
            <td>Multi-currency</td>
            <td>KES, USD, GBP, EUR, AED, TZS, UGX, ZAR and more</td>
          </tr>
          <tr>
            <td>Mobile-friendly</td>
            <td>Installable PWA — works on any device</td>
          </tr>
          <tr>
            <td>Simple pricing</td>
            <td>Flat monthly fee — no per-unit charges</td>
          </tr>
        </tbody>
      </table>

      <h2>When is the right time to switch?</h2>
      <p>
        If you&apos;re on spreadsheets and managing fewer than 3 properties with stable tenants, you
        might not need software yet. Spreadsheets can handle that — just.
      </p>
      <p>
        But there are clear signals that it&apos;s time:
      </p>
      <ul>
        <li>You&apos;ve missed a rent payment or only noticed it weeks late</li>
        <li>You can&apos;t quickly answer "what did I spend on repairs at Property B last quarter?"</li>
        <li>Producing an owner report takes more than 30 minutes</li>
        <li>You have a maintenance job sitting in WhatsApp that you&apos;re not sure has been resolved</li>
        <li>You&apos;re adding a new property and the spreadsheet is already straining</li>
      </ul>
      <p>
        Any one of these is a signal. All of them together means the spreadsheet is costing you
        money — in missed income, wasted time, and decisions made without the right information.
      </p>
      <p>
        The right software doesn&apos;t change how you manage properties. It just removes the friction
        so you can focus on actually managing them.
      </p>
    </BlogPostLayout>
  );
}
