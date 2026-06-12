import type { Metadata } from "next";
import Link from "next/link";
import { InboxMock } from "@/components/landing/InboxMock";
import { DashboardPreview } from "@/components/landing/DashboardPreview";

export const metadata: Metadata = {
  title: "Examples — GroundWorkPM",
  description:
    "See what you'll actually ship to owners and tenants: the operational inbox, owner statements, and the tenant portal — before you sign up.",
};

function SectionHeading({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10">
      <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gold mb-2">{kicker}</p>
      <h2 className="font-display text-3xl text-header dark:text-white mb-3">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed">{body}</p>
    </div>
  );
}

function StatementMock() {
  const rows = [
    { tenant: "J. Mwangi", unit: "A1", due: "85,000", received: "85,000", ok: true },
    { tenant: "S. Otieno", unit: "A2", due: "85,000", received: "85,000", ok: true },
    { tenant: "P. Njeri", unit: "B1", due: "120,000", received: "60,000", ok: false },
    { tenant: "D. Kamau", unit: "B2", due: "120,000", received: "120,000", ok: true },
  ];
  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="bg-header px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-white font-display text-sm">Owner Statement</p>
          <p className="text-white/50 text-xs font-sans">Riverside Apartments</p>
        </div>
        <p className="text-gold text-xs font-sans font-semibold">May 2026</p>
      </div>
      <div className="px-6 py-4">
        <table className="w-full text-xs font-sans">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="pb-2 font-medium">Tenant</th>
              <th className="pb-2 font-medium">Unit</th>
              <th className="pb-2 font-medium text-right">Rent due</th>
              <th className="pb-2 font-medium text-right">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unit} className="border-t border-gray-50">
                <td className="py-2 text-gray-700">{r.tenant}</td>
                <td className="py-2 text-gray-400">{r.unit}</td>
                <td className="py-2 text-right font-mono text-gray-700">{r.due}</td>
                <td className={`py-2 text-right font-mono ${r.ok ? "text-green-600" : "text-red-500"}`}>
                  {r.received}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 bg-cream rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-sans font-semibold text-header">Net payable to owner</p>
          <p className="font-mono text-sm font-bold text-green-700">KSh 312,400</p>
        </div>
        <p className="text-[10px] text-gray-300 font-sans mt-3 text-center">
          Generated automatically on the 5th of every month · emailed as PDF
        </p>
      </div>
    </div>
  );
}

function PortalMock() {
  return (
    <div className="max-w-xs mx-auto bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="bg-header px-5 py-4">
        <p className="text-white/50 text-[10px] font-sans uppercase tracking-wider">Tenant portal</p>
        <p className="text-white font-display text-sm mt-0.5">Hi Pauline 👋</p>
      </div>
      <div className="p-5 space-y-3">
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-[10px] font-sans text-red-400 uppercase tracking-wide">Balance due</p>
          <p className="font-mono text-lg font-bold text-red-600">KSh 60,000</p>
          <p className="text-[10px] font-sans text-gray-400 mt-0.5">Invoice INV-2026-0142 · due 5 Jun</p>
        </div>
        <button className="w-full bg-header text-white text-xs font-sans font-medium rounded-xl py-2.5">
          Submit payment proof
        </button>
        <div className="grid grid-cols-3 gap-2 text-center">
          {["Balance", "Receipts", "Repairs"].map((t) => (
            <div key={t} className="bg-cream rounded-lg py-2 text-[10px] font-sans text-gray-500">{t}</div>
          ))}
        </div>
        <p className="text-[10px] text-gray-300 font-sans text-center">
          One shareable link · no tenant passwords
        </p>
      </div>
    </div>
  );
}

export default function ExamplesPage() {
  return (
    <div className="py-16 px-4 space-y-24">
      {/* Hero */}
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="font-display text-4xl md:text-5xl text-header dark:text-white mb-4">
          See it before you sign up
        </h1>
        <p className="text-base text-gray-500 dark:text-gray-400 font-sans leading-relaxed max-w-xl mx-auto">
          These are the three things your owners and tenants will actually touch — the daily
          inbox that runs your operation, the statement that lands in every owner&apos;s email,
          and the portal you share with tenants.
        </p>
      </div>

      {/* Inbox */}
      <section>
        <SectionHeading
          kicker="For your team"
          title="The operational inbox"
          body="Overdue rent, expiring leases, urgent maintenance, and tenant requests in one prioritized queue — most items resolve in one click."
        />
        <div className="max-w-3xl mx-auto">
          <InboxMock />
        </div>
      </section>

      {/* Owner statement */}
      <section>
        <SectionHeading
          kicker="For your owners"
          title="Owner statements on autopilot"
          body="A per-unit income and expense statement, generated and emailed as a PDF on the remittance day in your management agreement. No spreadsheet assembly, ever."
        />
        <StatementMock />
      </section>

      {/* Tenant portal */}
      <section>
        <SectionHeading
          kicker="For your tenants"
          title="A tenant portal with zero logins"
          body="Each tenant gets a secure link: live balance, invoice PDFs, receipts, payment proof upload, and maintenance requests — straight into your inbox."
        />
        <PortalMock />
      </section>

      {/* Dashboard */}
      <section>
        <SectionHeading
          kicker="For your decisions"
          title="A live portfolio dashboard"
          body="Income, expenses, occupancy, arrears, and cash-flow forecasts per property — the numbers your spreadsheet was always one week behind on."
        />
        <div className="max-w-4xl mx-auto">
          <DashboardPreview />
        </div>
      </section>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/signup"
          className="inline-block bg-header text-white font-sans font-medium px-8 py-3.5 rounded-xl hover:bg-header/90 transition-colors"
        >
          Start your free 30-day trial
        </Link>
        <p className="text-xs text-gray-400 font-sans mt-3">
          No credit card required · <Link href="/pricing" className="underline underline-offset-2">see pricing</Link>
        </p>
      </div>
    </div>
  );
}
