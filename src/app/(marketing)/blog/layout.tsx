import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — GroundWork PM",
  description: "Practical guides for landlords and property managers who want systems, not stress. Learn how to track rent, manage maintenance, and run your portfolio like a business.",
  alternates: { canonical: "https://groundworkpm.com/blog" },
  openGraph: {
    title: "The Landlord's Playbook — GroundWork PM Blog",
    description: "Practical guides for property managers who want systems, not stress.",
    url: "https://groundworkpm.com/blog",
    siteName: "GroundWork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["https://groundworkpm.com/og-image.png"] },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
