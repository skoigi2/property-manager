import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
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
        display: ["var(--font-display)", "serif"],
        mono: ["var(--font-mono)", "monospace"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
