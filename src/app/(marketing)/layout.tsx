import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LandingThemeProvider } from "@/components/landing/LandingThemeProvider";
import { LandingNav } from "@/components/landing/LandingNav";

function MarketingFooter() {
  return (
    <footer className="border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#091525] py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo size={24} />
          <span className="font-display text-sm text-header dark:text-white">Groundwork PM</span>
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500 font-sans">
          <Link href="/pricing" className="hover:text-header dark:hover:text-white transition-colors">Pricing</Link>
          <Link href="/contact" className="hover:text-header dark:hover:text-white transition-colors">Contact</Link>
          <Link href="/login" className="hover:text-header dark:hover:text-white transition-colors">Sign in</Link>
          <Link href="/signup" className="hover:text-header dark:hover:text-white transition-colors">Sign up</Link>
          <Link href="/terms" className="hover:text-header dark:hover:text-white transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-header dark:hover:text-white transition-colors">Privacy</Link>
          <Link href="/refund" className="hover:text-header dark:hover:text-white transition-colors">Refund Policy</Link>
          <a href="mailto:support@groundworkpm.com" className="hover:text-header dark:hover:text-white transition-colors">Support</a>
        </div>
        <p className="text-xs text-gray-300 dark:text-gray-600 font-sans">
          © {new Date().getFullYear()} Groundwork PM
        </p>
      </div>
    </footer>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LandingThemeProvider>
      <div className="min-h-screen bg-cream dark:bg-[#0C1B2E] font-sans flex flex-col">
        <LandingNav />
        <div className="flex-1">
          {children}
        </div>
        <MarketingFooter />
      </div>
    </LandingThemeProvider>
  );
}
