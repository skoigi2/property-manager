import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Groundwork PM",
  description: "Groundwork PM's refund and cancellation policy for subscriptions.",
  alternates: {
    canonical: "https://groundworkpm.com/refund",
  },
  openGraph: {
    title: "Refund Policy — Groundwork PM",
    description: "Groundwork PM's refund and cancellation policy for subscriptions.",
    url: "https://groundworkpm.com/refund",
    siteName: "Groundwork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
};

export default function RefundPage() {
  return (
    <main className="pt-28 pb-20 max-w-3xl mx-auto px-6 dark:text-gray-300">
        <h1 className="font-display text-4xl text-header mb-2">Refund Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: April 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-display text-xl text-header mb-3">1. Free Trial</h2>
            <p>
              All new Groundwork PM accounts include a 30-day free trial. No payment is required to start your
              trial, and you will not be charged unless you explicitly choose to subscribe after your trial ends.
              There is nothing to refund during the trial period.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">2. Monthly Subscriptions</h2>
            <p>
              Monthly subscriptions are billed in advance at the start of each billing cycle. If you are not
              satisfied with the Service, you may request a full refund within <strong className="text-gray-700">7 days</strong> of
              a charge, provided you have not materially used the Service during that period (e.g., entered
              significant data, generated reports, or invited team members).
            </p>
            <p className="mt-3">
              After the 7-day window has passed, the charge for that billing period is non-refundable. You may
              cancel at any time, and your access will continue until the end of the current paid period.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">3. Annual Subscriptions</h2>
            <p>
              Annual subscriptions are billed upfront for a full 12-month period at a discounted rate. Refund
              eligibility for annual plans:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                <strong className="text-gray-700">Within 7 days of payment</strong> — full refund, no
                questions asked, regardless of usage.
              </li>
              <li>
                <strong className="text-gray-700">8 to 30 days after payment</strong> — pro-rated refund for
                the unused full months remaining, minus the equivalent monthly rate for months already used.
              </li>
              <li>
                <strong className="text-gray-700">After 30 days</strong> — no refund. Your subscription
                remains active until the end of the annual term.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">4. How to Request a Refund</h2>
            <p>
              To request a refund, email us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>{" "}
              with the subject line <strong className="text-gray-700">&ldquo;Refund Request&rdquo;</strong> and include:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>The email address associated with your account</li>
              <li>The date of the charge you are requesting a refund for</li>
              <li>A brief reason for your request</li>
            </ul>
            <p className="mt-3">
              We will respond within 2 business days. Approved refunds are processed through Paddle, our payment
              provider, and typically take <strong className="text-gray-700">5–10 business days</strong> to appear
              on your statement depending on your bank or card issuer.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">5. Exceptional Circumstances</h2>
            <p>
              We understand that unexpected situations arise. If you have a circumstance that falls outside the
              standard policy above — such as a serious illness, a billing error, or a Service outage that
              significantly impacted your use — please contact us and we will review your case individually.
              We aim to be fair and reasonable in all circumstances.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">6. Cancellation</h2>
            <p>
              You may cancel your subscription at any time from your account settings. Cancellation stops future
              renewals but does not trigger a refund for the current period unless you are within the eligible
              refund window described above. After cancellation, your account remains accessible in read-only
              mode until the end of your paid period, allowing you to export your data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">7. Payment Processing</h2>
            <p>
              All payments are processed by Paddle.com Market Limited, who act as our Merchant of Record. Refunds
              are issued back to the original payment method. Paddle may have their own policies that apply to
              certain payment methods — see the{" "}
              <a href="https://www.paddle.com/legal" className="text-header hover:underline" target="_blank" rel="noopener noreferrer">
                Paddle legal page
              </a>{" "}
              for details.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-header mb-3">8. Contact</h2>
            <p>
              Questions about this policy? Reach us at{" "}
              <a href="mailto:support@groundworkpm.com" className="text-header hover:underline">
                support@groundworkpm.com
              </a>.
            </p>
          </section>

        </div>
      </main>
  );
}
