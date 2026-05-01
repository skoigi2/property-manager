import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — Groundwork PM",
  description: "Get in touch with the Groundwork PM team for support, feature requests, or partnership enquiries.",
  alternates: { canonical: "https://groundworkpm.com/contact" },
  openGraph: {
    title: "Contact — Groundwork PM",
    description: "Get in touch with the Groundwork PM team.",
    url: "https://groundworkpm.com/contact",
    siteName: "Groundwork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="pt-28 pb-14 px-6 bg-cream dark:bg-[#0C1B2E]">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block bg-gold/10 dark:bg-gold/15 text-gold-dark text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-gold/20">
            Get in touch
          </span>
          <h1 className="font-display text-4xl md:text-5xl text-header dark:text-white leading-tight mb-4">
            We&apos;re here to help
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-lg leading-relaxed">
            Questions about Groundwork PM? A feature you&apos;d like to see? Drop us a message
            and we&apos;ll get back to you within 1 business day.
          </p>
        </div>
      </section>

      {/* ── Form + sidebar ── */}
      <section className="px-6 py-14 bg-white dark:bg-[#0C1B2E]">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-8">
            <div>
              <h2 className="font-display text-lg text-header dark:text-white mb-3">Support</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
                For help with your account, billing, or technical issues, use the form or email us directly.
              </p>
              <a
                href="mailto:support@groundworkpm.com"
                className="inline-block mt-3 text-sm font-semibold text-gold-dark dark:text-gold hover:underline font-sans"
              >
                support@groundworkpm.com
              </a>
            </div>

            <div>
              <h2 className="font-display text-lg text-header dark:text-white mb-3">New to Groundwork PM?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed mb-4">
                Start with a 30-day free trial. No credit card required.
              </p>
              <Link
                href="/signup"
                className="inline-block bg-header dark:bg-gold text-white dark:text-header font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors"
              >
                Start free trial →
              </Link>
            </div>

            <div>
              <h2 className="font-display text-lg text-header dark:text-white mb-3">Response time</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">
                We reply to all enquiries within <strong className="text-header dark:text-white">1 business day</strong>, Monday–Friday.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2 bg-cream dark:bg-[#091525] rounded-2xl p-8 border border-gray-100 dark:border-white/10">
            <ContactForm />
          </div>

        </div>
      </section>
    </div>
  );
}
