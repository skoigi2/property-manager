import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // The ONLY type scale. Replaces (not extends) Tailwind's stock sizes so
    // text-sm / text-2xl / text-[13px] etc. simply don't exist — every size,
    // line height, letter-spacing and default weight comes from these 8 tokens.
    // Rules: weights 400/500/600 only; serif is the logo wordmark only; money
    // uses tabular-nums; no leading-*/tracking-* in normal use. See docs/typography.md.
    fontSize: {
      display: ["3rem", { lineHeight: "3.25rem", letterSpacing: "-0.025em", fontWeight: "600" }], // 48/52 — marketing hero (desktop)
      h1: ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em", fontWeight: "600" }], // 28/34 — page titles, KPI values
      h2: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }], // 20/28 — card/section headings
      h3: ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "600" }], // 16/24 — sub-headings, modal titles
      "body-lg": ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }], // 16/24 — marketing/lead paragraphs
      body: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }], // 14/20 — default UI text
      caption: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em", fontWeight: "400" }], // 12/16 — meta, badges, dense cells
      label: ["0.6875rem", { lineHeight: "0.875rem", letterSpacing: "0.05em", fontWeight: "500" }], // 11/14 — uppercase micro-labels
    },
    extend: {
      colors: {
        gold: {
          DEFAULT: "#C9A84C",
          light: "#E8C97A",
          dark: "#A07C2E",
        },
        cream: {
          DEFAULT: "#FAF7F2",
          dark: "#F0EBE1",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          dark: "#1A1A2E",
        },
        income: "#16A34A",
        expense: "#DC2626",
        header: "#1A1A2E",
      },
      fontFamily: {
        // display = DM Serif Display, logo wordmark ONLY.
        display: ["var(--font-display)", "serif"],
        // mono = system stack, scoped to API keys / tokens / reference codes. Never money.
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
