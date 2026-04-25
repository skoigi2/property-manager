"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLandingTheme } from "./LandingThemeProvider";

export function LandingNav() {
  const { dark, toggle } = useLandingTheme();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#091525]/95 backdrop-blur border-b border-gray-100 dark:border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo + links grouped left */}
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="font-display text-lg text-header dark:text-white">Groundwork PM</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-sans">
            <a
              href="#outcomes"
              className="text-gray-500 dark:text-gray-400 hover:text-header dark:hover:text-white transition-colors"
            >
              Features
            </a>
            <Link
              href="/pricing"
              className="text-gray-500 dark:text-gray-400 hover:text-header dark:hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-gray-500 dark:text-gray-400 hover:text-header dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Right side: theme toggle + CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-header dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? (
              /* Sun */
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              /* Moon */
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <Link
            href="/signup"
            className="bg-header dark:bg-gold text-white dark:text-header text-sm font-sans font-medium px-6 py-2.5 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </nav>
  );
}
