"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Users, FileText, Zap, BarChart3, ChevronRight, ChevronLeft, X } from "lucide-react";

const STORAGE_KEY = "gw:welcome-tour-done";

const STEPS = [
  {
    icon: Inbox,
    title: "Your Inbox runs the day",
    body: "Everything that needs attention — overdue rent, expiring leases, urgent maintenance, tenant requests — lands in one prioritized queue. Most items resolve with one click.",
    cta: { label: "Open Inbox", href: "/inbox" },
  },
  {
    icon: Users,
    title: "Add tenants, get a rent roll",
    body: "Add your units and tenants once. Lease expiries, deposits, arrears, and renewals are tracked automatically from then on.",
    cta: { label: "Add tenants", href: "/tenants" },
  },
  {
    icon: FileText,
    title: "Invoices + a tenant portal",
    body: "Issue rent invoices, then share each tenant's portal link — they see their balance, download receipts, submit payment proof and maintenance requests. No tenant logins to manage.",
    cta: { label: "View invoices", href: "/invoices" },
  },
  {
    icon: Zap,
    title: "Turn on automations",
    body: "Let the system open renewal cases, chase arrears, alert on compliance expiries, and email owners their monthly statement — each one a single toggle.",
    cta: { label: "Open Automations", href: "/automations" },
  },
  {
    icon: BarChart3,
    title: "Owner-ready reports",
    body: "Monthly P&L, owner statements, and annual summaries — generated as polished PDFs your landlords will actually read.",
    cta: { label: "See reports", href: "/report" },
  },
];

/**
 * One-time welcome carousel for new users. Shows until completed or skipped
 * (persisted in localStorage). Mounted on the dashboard, hidden for OWNER.
 */
export function WelcomeTour() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // storage unavailable — never block the dashboard
    }
  }, []);

  if (!open) return null;

  function finish(href?: string) {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    setOpen(false);
    if (href) router.push(href);
  }

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex justify-end p-3 pb-0">
          <button
            onClick={() => finish()}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Skip tour"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-4">
            <Icon size={26} className="text-gold" />
          </div>
          <h2 className=" text-h2 text-header mb-2">{s.title}</h2>
          <p className="text-body text-gray-500 ">{s.body}</p>

          <button
            onClick={() => finish(s.cta.href)}
            className="mt-5 text-caption font-medium text-gold hover:text-gold-dark underline underline-offset-2"
          >
            {s.cta.label} →
          </button>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-gold" : "w-1.5 bg-gray-200"}`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setStep((v) => Math.max(0, v - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 text-body text-gray-400 hover:text-gray-700 disabled:opacity-0 transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
            {isLast ? (
              <button
                onClick={() => finish()}
                className="inline-flex items-center gap-1.5 bg-header text-white text-body font-medium px-5 py-2.5 rounded-xl hover:bg-header/90 transition-colors"
              >
                Get started
              </button>
            ) : (
              <button
                onClick={() => setStep((v) => v + 1)}
                className="inline-flex items-center gap-1.5 bg-header text-white text-body font-medium px-5 py-2.5 rounded-xl hover:bg-header/90 transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
