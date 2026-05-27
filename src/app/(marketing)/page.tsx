import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { MarketingHero } from "@/components/landing/MarketingHero";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { ShiftSection } from "@/components/landing/ShiftSection";
import { AutomationCards } from "@/components/landing/AutomationCards";
import { InboxMock } from "@/components/landing/InboxMock";
import { WeeklyRhythm } from "@/components/landing/WeeklyRhythm";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { SpreadsheetComparison } from "@/components/landing/SpreadsheetComparison";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";

export const metadata: Metadata = {
  title: "Groundwork PM — The property platform that updates itself.",
  description:
    "Mark an invoice paid and the owner statement is current. Assign a vendor and the case advances itself. Built for agencies managing portfolios across emerging and established markets.",
  alternates: {
    canonical: "https://groundworkpm.com",
  },
  openGraph: {
    title: "Groundwork PM — The property platform that updates itself.",
    description:
      "Mark an invoice paid and the owner statement is current. Assign a vendor and the case advances itself. No manual refresh.",
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
    title: "Groundwork PM — The property platform that updates itself.",
    description:
      "Built for agencies running portfolios for multiple owners across emerging and established markets. 30-day free trial.",
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
      <MarketingHero />
      <TrustStrip />
      <ShiftSection />
      <AutomationCards />
      <InboxMock />
      <WeeklyRhythm />
      <DashboardPreview />
      <SpreadsheetComparison />
      <Pricing />
      <FinalCTA />
    </>
  );
}
