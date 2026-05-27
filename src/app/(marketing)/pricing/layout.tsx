import type { Metadata } from "next";

export const metadata: Metadata = {
  // Default to variant (b) — no-gates promise as the hook. Two variants listed
  // in the plan for selection: see the post-implementation report.
  title: "Pricing — Groundwork PM",
  description:
    "Three tiers, one platform. Automatic rent posting, magic-link approvals, expiry alerts, and owner statements that update themselves. 30-day free trial.",
  alternates: {
    canonical: "https://groundworkpm.com/pricing",
  },
  openGraph: {
    title: "Pricing — Groundwork PM",
    description:
      "Every tier includes the full feature set. Tiers differ by portfolio size and team headcount. 30-day free trial, no card.",
    url: "https://groundworkpm.com/pricing",
    siteName: "Groundwork PM",
    type: "website",
    images: [
      {
        url: "https://groundworkpm.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Groundwork PM Pricing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Groundwork PM",
    description:
      "Three tiers, one platform. Same automation in every plan. 30-day free trial, no card.",
    images: ["https://groundworkpm.com/og-image.png"],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What happens when my trial ends?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your account moves to read-only access. Your data is never deleted. Upgrade to resume writes.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need a credit card to start?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Your 30-day trial is completely free with no card required. You only enter payment details when you decide to upgrade.",
      },
    },
    {
      "@type": "Question",
      name: "Can I change plans later?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the next billing cycle.",
      },
    },
    {
      "@type": "Question",
      name: "What currencies does it support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "KES, USD, GBP, EUR, AED, TZS, UGX, ZAR, INR, CHF — with more on request. Each property can have its own currency.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data safe?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PostgreSQL with row-level security, encrypted in transit and at rest, hosted on enterprise-grade infrastructure with daily backups. Your data is never shared or sold.",
      },
    },
    {
      "@type": "Question",
      name: "Can I cancel anytime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Cancel from your billing page at any time. You'll keep access until the end of your paid period.",
      },
    },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {children}
    </>
  );
}
