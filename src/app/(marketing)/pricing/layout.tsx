import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Groundwork PM",
  description:
    "Simple, transparent pricing for professional property managers. Start your 30-day free trial — no credit card required.",
  alternates: {
    canonical: "https://groundworkpm.com/pricing",
  },
  openGraph: {
    title: "Pricing — Groundwork PM",
    description:
      "Simple, transparent pricing for professional property managers. Start your 30-day free trial — no credit card required.",
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
      "Simple, transparent pricing for professional property managers. Start your 30-day free trial.",
    images: ["https://groundworkpm.com/og-image.png"],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
