import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { HomeHero } from "@/components/landing/HomeHero";
import { HomeProblems } from "@/components/landing/HomeProblems";
import { HomeSolutions } from "@/components/landing/HomeSolutions";
import { HomeDifferentiator } from "@/components/landing/HomeDifferentiator";
import { HomeFinalCTA } from "@/components/landing/HomeFinalCTA";

export const metadata: Metadata = {
  title: "Groundwork PM — Run property operations from one system.",
  description:
    "Stop running property operations through WhatsApp and spreadsheets. Track rent, maintenance, owner approvals, renewals and reporting in one operational system. Book a 15-minute demo.",
  alternates: {
    canonical: "https://groundworkpm.com",
  },
  openGraph: {
    title: "Groundwork PM — Run property operations from one system.",
    description:
      "Track rent, maintenance, owner approvals, renewals and reporting in one operational system — so nothing falls through the cracks as your portfolio grows.",
    url: "https://groundworkpm.com",
    siteName: "Groundwork PM",
    type: "website",
    images: [
      {
        url: "https://groundworkpm.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Groundwork PM — Operating system for property management teams",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Groundwork PM — Run property operations from one system.",
    description:
      "Track rent, maintenance, owner approvals, renewals and reporting in one operational system. 30-day free trial.",
    images: ["https://groundworkpm.com/og-image.png"],
  },
};

export default async function RootPage() {
  const session = await auth();
  if (session) {
    if (session.user.role === "OWNER") redirect("/report");
    redirect("/dashboard");
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://groundworkpm.com/#organization",
        name: "Groundwork PM",
        url: "https://groundworkpm.com",
        logo: "https://groundworkpm.com/logo.svg",
        description:
          "Operating system for modern property management teams. Built for portfolios across emerging and established markets.",
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://groundworkpm.com/#software",
        name: "Groundwork PM",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://groundworkpm.com",
        publisher: { "@id": "https://groundworkpm.com/#organization" },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "30-day free trial · no credit card required",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeHero />
      <HomeProblems />
      <HomeSolutions />
      <HomeDifferentiator />
      <HomeFinalCTA />
    </>
  );
}
