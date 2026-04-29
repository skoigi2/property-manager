import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions — Groundwork PM",
  description: "Terms and Conditions governing use of the Groundwork PM property management platform.",
  alternates: {
    canonical: "https://groundworkpm.com/terms",
  },
  openGraph: {
    title: "Terms and Conditions — Groundwork PM",
    description: "Terms and Conditions governing use of the Groundwork PM property management platform.",
    url: "https://groundworkpm.com/terms",
    siteName: "Groundwork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
};

export default function TermsPage() {
  return (
    <main className="pt-28 pb-20 max-w-3xl mx-auto px-6 dark:text-gray-300">
        <h1 className="font-display text-4xl text-header mb-2">Terms and Conditions</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: April 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-display text-xl text-header mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Groundwork PM (&ldquo;the Service&rdquo;), you agree to be bound by these Terms and
              Conditions (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you may not use the Service. These
              Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">2. Description of Service</h2>
            <p>
              Groundwork PM is a cloud-based property management platform that provides tools for tracking rental
              income, managing expenses, monitoring tenant leases, generating financial reports, and related property
              management functions. The Service is provided by Groundwork PM, a software business operating from
              the Kingdom of Bahrain.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">3. Free Trial</h2>
            <p>
              New accounts receive a 30-day free trial with full access to the Service. No payment information is
              required to start a trial. At the end of the trial period, your account will transition to a paid
              subscription or be restricted to read-only access until a plan is selected. We reserve the right to
              modify trial terms at any time.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">4. Subscriptions and Billing</h2>
            <p>
              Paid subscriptions are available on monthly or annual billing cycles. Subscriptions automatically
              renew at the end of each billing period unless cancelled before the renewal date. Billing is processed
              by Paddle.com Market Limited (&ldquo;Paddle&rdquo;), our authorised reseller and Merchant of Record. By
              purchasing a subscription, you agree to Paddle&rsquo;s terms of service in addition to these Terms.
            </p>
            <p className="mt-3">
              We reserve the right to change subscription prices with at least 30 days&rsquo; notice. Continued use of
              the Service after a price change constitutes acceptance of the new pricing.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">5. Account Registration</h2>
            <p>
              You must provide accurate, current, and complete information when creating an account. You are
              responsible for maintaining the confidentiality of your login credentials and for all activity that
              occurs under your account. You must notify us immediately at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>{" "}
              if you become aware of any unauthorised use of your account.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">6. User Obligations</h2>
            <p>You agree that you will not:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Use the Service for any unlawful purpose or in violation of any applicable regulations</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its related systems</li>
              <li>Upload or transmit malicious code, viruses, or any software intended to disrupt the Service</li>
              <li>Reverse engineer, decompile, or otherwise attempt to derive the source code of the Service</li>
              <li>Resell, sublicense, or otherwise transfer access to the Service to third parties</li>
              <li>Use the Service to store or transmit content that is illegal, defamatory, or infringes third-party rights</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">7. Data and Intellectual Property</h2>
            <p>
              You retain full ownership of all data you enter into the Service, including property details, tenant
              records, and financial information (&ldquo;Your Data&rdquo;). You grant Groundwork PM a limited licence
              to store and process Your Data solely to provide and improve the Service.
            </p>
            <p className="mt-3">
              All software, design, trademarks, and content comprising the Service (excluding Your Data) are the
              intellectual property of Groundwork PM and may not be copied, reproduced, or used without our express
              written consent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">8. Data Export and Portability</h2>
            <p>
              You may export your property data at any time using the built-in export tools available within the
              Service. Upon account closure, you will have 30 days to export your data before it is permanently
              deleted from our systems.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">9. Availability and Uptime</h2>
            <p>
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access.
              Scheduled maintenance, infrastructure outages, or circumstances beyond our control may cause
              temporary unavailability. We will endeavour to provide advance notice of planned maintenance where
              possible.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">10. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
              express or implied, including but not limited to merchantability, fitness for a particular purpose, or
              non-infringement. Groundwork PM does not warrant that the Service will meet your specific requirements
              or that it will be error-free.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Groundwork PM shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill,
              arising out of or in connection with your use of the Service. Our total aggregate liability to you for
              any claim shall not exceed the amount you paid to us in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">12. Termination</h2>
            <p>
              You may cancel your subscription at any time through your account settings. Cancellation takes effect
              at the end of your current billing period, after which your account will revert to a limited state.
            </p>
            <p className="mt-3">
              We reserve the right to suspend or terminate your account immediately if you breach these Terms, engage
              in fraudulent activity, or if your account poses a risk to the Service or other users. In such cases,
              no refund will be issued for any unused portion of a paid subscription.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">13. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the Kingdom of Bahrain. Any
              disputes arising under or in connection with these Terms shall be subject to the exclusive jurisdiction
              of the courts of Bahrain.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">14. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we make material changes, we will notify you by
              email or by displaying a prominent notice within the Service. Continued use of the Service after
              changes take effect constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">15. Contact</h2>
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>.
            </p>
          </section>

        </div>
      </main>
  );
}
