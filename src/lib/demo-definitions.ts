export interface DemoDefinition {
  key: string;
  /** Property name — also used for the idempotency check in the seed route */
  name: string;
  country: string;
  currency: string;
  units: number;
  description: string;
  flag: string;
}

/**
 * Registry of available demo properties.
 * Adding a new entry here automatically surfaces it in the onboarding
 * demo picker and the Properties page empty state — no UI changes needed.
 */
export const DEMO_PROPERTIES: DemoDefinition[] = [
  {
    key: "al-seef",
    name: "Al Seef Residences",
    country: "Bahrain",
    currency: "BHD",
    units: 20,
    description: "20-unit residential tower in Manama — 3 months of income, expenses, tenants & arrears.",
    flag: "🇧🇭",
  },
  // Future demos registered here. Each needs a matching case in /api/demo/seed/route.ts
];
