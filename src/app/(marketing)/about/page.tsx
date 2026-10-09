import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About GroundWork PM",
  description: "Who we are and why we built GroundWork PM",
  alternates: { canonical: "https://groundworkpm.com/about" },
  openGraph: {
    title: "About GroundWork PM",
    description: "Who we are and why we built GroundWork PM",
    url: "https://groundworkpm.com/about",
    siteName: "GroundWork PM",
    type: "website",
    images: [{ url: "https://groundworkpm.com/og-image.png", width: 1200, height: 630 }],
  },
};

const PRINCIPLES = [
  {
    title: "Every figure has a source",
    body: "Each number in a report traces back to a payment, a receipt or a meter reading.",
  },
  {
    title: "Every plan gets every feature",
    body: "You pay for how many properties and people you have, not to unlock tools.",
  },
  {
    title: "It's for the people on site too",
    body: "Caretakers log readings and repairs from their phones, and tenants pay and raise issues from their own portal.",
  },
];

const CONTACT_EMAIL = "stephen@groundworkpm.com";

const FACTS: { label: string; value: React.ReactNode }[] = [
  { label: "Legal name", value: "GroundWork PM" },
  { label: "Registered in", value: "Kenya" },
  { label: "Founded", value: "15 January 2026" },
  { label: "Founder", value: "Stephen Njoroge" },
  {
    label: "Contact",
    value: (
      <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold-dark dark:text-gold hover:underline break-all">
        {CONTACT_EMAIL}
      </a>
    ),
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="pt-28 pb-16 px-6 bg-cream dark:bg-[#0C1B2E]">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-h1 md:text-display text-header dark:text-white mb-5">
            Property management, built from the ground up
          </h1>
          <p className="text-body-lg text-gray-500 dark:text-gray-400">
            GroundWork PM is software for landlords and managing agents. Rent, payments, meter readings, repairs and
            owner statements sit in one place, instead of spread across spreadsheets and WhatsApp groups.
          </p>
        </div>
      </section>

      {/* ── Why I built this ── */}
      <section className="py-16 px-6 bg-white dark:bg-[#091525]">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-h1 text-header dark:text-white mb-6">Why I built this</h2>
          <div className="space-y-5 text-body-lg text-gray-600 dark:text-gray-300">
            <p>
              Most property managers I know run their buildings on Excel, WhatsApp and a receipt book. It works, until
              an owner asks how much a property actually earned last year, or nobody can say which tenant still owes
              for water.
            </p>
            <p>
              I built GroundWork PM to replace that uncertainty with clarity. A better way to manage properties, track
              finances and keep every detail accountable, built around the realities of day-to-day property
              management, not just how software assumes it should work.
            </p>
          </div>
          <div className="mt-8 pt-4 border-t-2 border-gold w-fit">
            <p className="text-body font-medium text-header dark:text-white">Stephen Njoroge, Founder</p>
          </div>
        </div>
      </section>

      {/* ── How we work ── */}
      <section className="py-16 px-6 bg-cream dark:bg-[#0C1B2E]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-h1 text-header dark:text-white mb-8 text-center">How we work</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-7"
              >
                <h3 className="text-h3 text-header dark:text-white mb-2">{p.title}</h3>
                <p className="text-body text-gray-500 dark:text-gray-400">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The company ── */}
      <section className="py-16 px-6 bg-white dark:bg-[#091525]">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-h1 text-header dark:text-white mb-6">The company</h2>
          <dl className="bg-cream dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl px-6 divide-y divide-gray-200 dark:divide-white/10">
            {FACTS.map((f) => (
              <div key={f.label} className="py-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
                <dt className="text-label uppercase text-gray-400 dark:text-gray-500 sm:w-40 shrink-0">{f.label}</dt>
                <dd className="text-body text-header dark:text-white min-w-0">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-body text-gray-500 dark:text-gray-400">
            Questions, or want to see it working?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold-dark dark:text-gold hover:underline">
              Email me
            </a>{" "}
            or use the{" "}
            <Link href="/contact" className="text-gold-dark dark:text-gold hover:underline">
              contact form
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
