import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Groundwork PM",
  description: "How Groundwork PM collects, uses, and protects your personal data.",
  alternates: {
    canonical: "https://groundworkpm.com/privacy",
  },
  openGraph: {
    title: "Privacy Policy — Groundwork PM",
    description: "How Groundwork PM collects, uses, and protects your personal data.",
    url: "https://groundworkpm.com/privacy",
    siteName: "Groundwork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
};

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-header rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="font-display text-lg text-header">Groundwork PM</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-sans">
          <Link href="/#features" className="text-gray-500 hover:text-header transition-colors">Features</Link>
          <Link href="/pricing" className="text-gray-500 hover:text-header transition-colors">Pricing</Link>
          <Link href="/login" className="text-gray-500 hover:text-header transition-colors">Sign in</Link>
        </div>
        <Link href="/signup" className="bg-header text-white text-sm font-sans font-medium px-5 py-2 rounded-lg hover:bg-header/90 transition-colors">
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-header rounded flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="font-display text-sm text-header">Groundwork PM</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400 font-sans">
          <Link href="/pricing" className="hover:text-header transition-colors">Pricing</Link>
          <Link href="/login" className="hover:text-header transition-colors">Sign in</Link>
          <Link href="/signup" className="hover:text-header transition-colors">Sign up</Link>
          <Link href="/terms" className="hover:text-header transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-header transition-colors">Privacy</Link>
          <Link href="/refund" className="hover:text-header transition-colors">Refund Policy</Link>
          <a href="mailto:support@groundworkpm.com" className="hover:text-header transition-colors">Support</a>
        </div>
        <p className="text-xs text-gray-300 font-sans">© {new Date().getFullYear()} Groundwork PM</p>
      </div>
    </footer>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Nav />

      <main className="pt-28 pb-20 max-w-3xl mx-auto px-6">
        <h1 className="font-display text-4xl text-header mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: April 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-display text-xl text-header mb-3">1. Who We Are</h2>
            <p>
              Groundwork PM (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is a property management
              software business operating from the Kingdom of Bahrain. We operate the Groundwork PM platform
              accessible at groundworkpm.com. For privacy matters, you may contact us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">2. Data We Collect</h2>
            <p>We collect the following categories of data:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>
                <strong className="text-gray-700">Account information</strong> — your name, email address,
                company/organisation name, and password hash when you register.
              </li>
              <li>
                <strong className="text-gray-700">Property and business data</strong> — property details, unit
                information, tenant records, lease terms, income and expense entries, and other data you enter
                into the Service.
              </li>
              <li>
                <strong className="text-gray-700">Billing information</strong> — subscription plan and billing
                status. Payment card details are processed directly by Paddle and are never stored by us.
              </li>
              <li>
                <strong className="text-gray-700">Usage data</strong> — pages visited, features used, and
                actions taken within the application, collected to improve the Service.
              </li>
              <li>
                <strong className="text-gray-700">Technical data</strong> — IP address, browser type, device
                type, and session information collected automatically when you access the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">3. How We Use Your Data</h2>
            <p>We use your data to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Create and manage your account and provide access to the Service</li>
              <li>Process subscription billing through our payment partner Paddle</li>
              <li>Send transactional emails such as invoices, password resets, and lease expiry notifications</li>
              <li>Respond to support requests and communicate with you about the Service</li>
              <li>Monitor and improve the reliability, performance, and security of the Service</li>
              <li>Comply with legal obligations applicable to our business</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal data to third parties, and we do not use your data for advertising
              or marketing purposes beyond communications about Groundwork PM itself.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">4. Third-Party Service Providers</h2>
            <p>
              We share data with the following trusted third-party processors who help us deliver the Service.
              Each is bound by data processing agreements and handles data only as instructed by us:
            </p>
            <div className="mt-3 space-y-3">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-700">Paddle.com Market Limited</p>
                <p className="text-sm mt-1">Payment processing and subscription management. Acts as Merchant of Record for all transactions. <a href="https://www.paddle.com/legal/privacy" className="text-header hover:underline" target="_blank" rel="noopener noreferrer">Paddle Privacy Policy →</a></p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-700">Supabase</p>
                <p className="text-sm mt-1">Database hosting and file storage for all application data and uploaded documents. Data is stored in encrypted cloud infrastructure.</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-700">Resend</p>
                <p className="text-sm mt-1">Transactional email delivery for notifications, invoices, and account emails.</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-700">Google (OAuth)</p>
                <p className="text-sm mt-1">Optional sign-in with Google. If you use Google sign-in, Google shares your name and email address with us to create your account. No additional Google data is accessed.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">5. Cookies</h2>
            <p>
              We use only essential session cookies necessary for you to remain logged in and use the Service
              securely. We do not use advertising, tracking, or analytics cookies. No third-party advertising
              networks receive data through our cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. If you close your account, your data
              will be available for export for 30 days, after which it will be permanently and irreversibly
              deleted from our systems and backups within a further 60 days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong className="text-gray-700">Access</strong> — request a copy of the personal data we hold about you</li>
              <li><strong className="text-gray-700">Rectification</strong> — correct inaccurate data at any time through your account settings</li>
              <li><strong className="text-gray-700">Erasure</strong> — request deletion of your account and associated personal data</li>
              <li><strong className="text-gray-700">Portability</strong> — export your property and financial data in machine-readable format using the built-in export tools</li>
              <li><strong className="text-gray-700">Objection</strong> — object to processing of your data in specific circumstances</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">8. Data Security</h2>
            <p>
              We implement industry-standard security measures including encrypted data transmission (TLS),
              encrypted data at rest, access controls, and regular security reviews. However, no system is
              completely secure, and we cannot guarantee absolute security of your data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">9. Children&rsquo;s Privacy</h2>
            <p>
              The Service is not intended for use by persons under the age of 18. We do not knowingly collect
              personal data from minors. If you believe we have inadvertently collected such data, please
              contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by
              email or by displaying a notice within the Service. The &ldquo;Last updated&rdquo; date at the top
              of this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">11. Contact Us</h2>
            <p>
              For privacy questions, data requests, or concerns, please contact us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>.
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
