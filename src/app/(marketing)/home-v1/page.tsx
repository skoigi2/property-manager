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

// Archived original homepage — kept for reference. Not indexed, not linked.
export const metadata: Metadata = {
  title: "Groundwork PM — Homepage (archived v1)",
  robots: { index: false, follow: false },
};

export default function HomeV1Page() {
  return (
    <>
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
