"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import toast from "react-hot-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_TYPES = [
  { value: "BEDSITTER",  label: "Bedsitter / Studio" },
  { value: "ONE_BED",    label: "1 Bedroom"           },
  { value: "TWO_BED",    label: "2 Bedrooms"          },
  { value: "THREE_BED",  label: "3 Bedrooms"          },
  { value: "FOUR_BED",   label: "4+ Bedrooms"         },
  { value: "PENTHOUSE",  label: "Penthouse"            },
  { value: "COMMERCIAL", label: "Commercial"           },
  { value: "OTHER",      label: "Other"               },
];

const CURRENCIES = [
  { code: "USD", label: "US Dollar"         },
  { code: "GBP", label: "British Pound"     },
  { code: "EUR", label: "Euro"              },
  { code: "KES", label: "Kenyan Shilling"   },
  { code: "AED", label: "UAE Dirham"        },
  { code: "ZAR", label: "South African Rand"},
  { code: "NGN", label: "Nigerian Naira"    },
  { code: "GHS", label: "Ghanaian Cedi"     },
  { code: "TZS", label: "Tanzanian Shilling"},
  { code: "UGX", label: "Ugandan Shilling"  },
  { code: "INR", label: "Indian Rupee"      },
  { code: "CAD", label: "Canadian Dollar"   },
  { code: "AUD", label: "Australian Dollar" },
  { code: "SGD", label: "Singapore Dollar"  },
  { code: "CHF", label: "Swiss Franc"       },
  { code: "SAR", label: "Saudi Riyal"       },
  { code: "QAR", label: "Qatari Riyal"      },
  { code: "KWD", label: "Kuwaiti Dinar"     },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50";

const selectCls =
  "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50";

// ─── UI primitives ────────────────────────────────────────────────────────────

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full flex-1 transition-all duration-300 ${
            i < current ? "bg-gold" : i === current ? "bg-header" : "bg-gray-100"
          }`}
        />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1.5 font-sans">{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Step 1 — Property ────────────────────────────────────────────────────────

interface StepPropertyProps {
  needsOrg: boolean;
  onNext: (propertyId: string, newOrgId: string | null) => void;
}

function StepProperty({ needsOrg, onNext }: StepPropertyProps) {
  const [orgName,   setOrgName]   = useState("");
  const [name,      setName]      = useState("");
  const [type,      setType]      = useState("LONGTERM");
  const [currency,  setCurrency]  = useState("USD");
  const [address,   setAddress]   = useState("");
  const [city,      setCity]      = useState("");
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsOrg && !orgName.trim()) { toast.error("Organisation name is required."); return; }
    if (!name.trim()) { toast.error("Property name is required."); return; }
    setLoading(true);

    try {
      let newOrgId: string | null = null;

      // 1. Create org for Google OAuth users who have none yet
      if (needsOrg) {
        const res = await fetch("/api/onboarding/create-org", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ name: orgName.trim() }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error ?? "Failed to create organisation.");
          return;
        }
        const d = await res.json();
        newOrgId = d.orgId as string;
      }

      // 2. Create property
      const res = await fetch("/api/properties", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:     name.trim(),
          type,
          currency,
          address:  address.trim() || undefined,
          city:     city.trim()    || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Failed to create property.");
        return;
      }
      const property = await res.json();
      onNext(property.id, newOrgId);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needsOrg && (
        <Field label="Organisation / company name">
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Oakwood Property Group"
            required
            className={inputCls}
          />
        </Field>
      )}

      <Field label="Property name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Riverside Apartments"
          required
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Property type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            <option value="LONGTERM">Long-term rental</option>
            <option value="AIRBNB">Short-let / Airbnb</option>
          </select>
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Address (optional)">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St"
            className={inputCls}
          />
        </Field>
        <Field label="City (optional)">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="London"
            className={inputCls}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-header text-white py-2.5 rounded-lg font-sans font-medium text-sm hover:bg-header/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2"><Spinner />Setting up…</span>
        ) : (
          "Continue →"
        )}
      </button>
    </form>
  );
}

// ─── Step 2 — Units ───────────────────────────────────────────────────────────

interface UnitRow { unitNumber: string; type: string; monthlyRent: string; }

function StepUnits({ propertyId, onNext }: { propertyId: string; onNext: () => void }) {
  const [units,   setUnits]   = useState<UnitRow[]>([{ unitNumber: "", type: "ONE_BED", monthlyRent: "" }]);
  const [loading, setLoading] = useState(false);

  function upd(i: number, field: keyof UnitRow, val: string) {
    setUnits((prev) => prev.map((u, idx) => idx === i ? { ...u, [field]: val } : u));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = units.filter((u) => u.unitNumber.trim());
    if (filled.length === 0) { onNext(); return; }

    setLoading(true);
    try {
      for (const unit of filled) {
        const res = await fetch("/api/units", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            propertyId,
            unitNumber:  unit.unitNumber.trim(),
            type:        unit.type,
            monthlyRent: unit.monthlyRent ? Number(unit.monthlyRent) : undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error ?? `Failed to create unit "${unit.unitNumber}".`);
          return;
        }
      }
      onNext();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-gray-400 font-sans -mt-2 mb-1">
        Add units now, or skip and add them from the dashboard later.
      </p>

      {units.map((unit, i) => (
        <div key={i} className="bg-cream/60 rounded-xl p-4 space-y-3 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 font-sans uppercase tracking-wide">
              Unit {i + 1}
            </span>
            {units.length > 1 && (
              <button
                type="button"
                onClick={() => setUnits((p) => p.filter((_, idx) => idx !== i))}
                className="text-xs text-red-400 hover:text-red-600 font-sans"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit number">
              <input
                type="text"
                value={unit.unitNumber}
                onChange={(e) => upd(i, "unitNumber", e.target.value)}
                placeholder="A1, 101, GF…"
                className={inputCls}
              />
            </Field>
            <Field label="Type">
              <select value={unit.type} onChange={(e) => upd(i, "type", e.target.value)} className={selectCls}>
                {UNIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Monthly rent (optional)">
            <input
              type="number"
              value={unit.monthlyRent}
              onChange={(e) => upd(i, "monthlyRent", e.target.value)}
              placeholder="0"
              min="0"
              className={inputCls}
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setUnits((p) => [...p, { unitNumber: "", type: "ONE_BED", monthlyRent: "" }])}
        className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 font-sans hover:border-gold hover:text-gold transition-colors"
      >
        + Add another unit
      </button>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onNext}
          disabled={loading}
          className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500 font-sans hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Skip for now
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-header text-white py-2.5 rounded-lg font-sans font-medium text-sm hover:bg-header/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2"><Spinner />Saving…</span>
          ) : (
            "Save & continue →"
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Step 3 — Done ────────────────────────────────────────────────────────────

function StepDone({ newOrgId }: { newOrgId: string | null }) {
  const { update } = useSession();
  const router     = useRouter();
  const [loading,      setLoading]      = useState(false);
  const [seedLoading,  setSeedLoading]  = useState(false);
  const [selectedDemo, setSelectedDemo] = useState(DEMO_PROPERTIES[0]?.key ?? "");

  async function refreshAndNavigate(orgId: string | null) {
    if (orgId) {
      await update({ organizationId: orgId, membershipCount: 1 }).catch(() => {});
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function goToDashboard() {
    setLoading(true);
    try { await refreshAndNavigate(newOrgId); } catch { /* ignore */ }
  }

  async function loadSampleData() {
    setSeedLoading(true);
    try {
      // If this is a new org (Google OAuth flow), update the JWT before calling
      // the seed route — otherwise session.user.organizationId is still null
      // and the server returns "No organisation found".
      if (newOrgId) {
        await update({ organizationId: newOrgId, membershipCount: 1 }).catch(() => {});
      }

      const res = await fetch("/api/demo/seed", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ demoKey: selectedDemo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data?.reason !== "already_seeded") {
        toast.error(data?.detail ?? data?.error ?? "Could not load sample data.");
        return;
      }
      await refreshAndNavigate(newOrgId);
    } catch {
      toast.error("Could not load sample data. You can still explore the dashboard.");
    } finally {
      setSeedLoading(false);
    }
  }

  return (
    <div className="text-center py-2">
      {/* Checkmark */}
      <div className="w-16 h-16 bg-gold/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <svg className="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-display text-2xl text-header mb-2">You&apos;re all set!</h2>
      <p className="text-sm text-gray-500 font-sans leading-relaxed mb-6 max-w-xs mx-auto">
        Your property is ready. Head to the dashboard to track income, manage tenants, and generate reports.
      </p>

      {/* Primary CTA */}
      <button
        onClick={goToDashboard}
        disabled={loading || seedLoading}
        className="w-full bg-header text-white py-3 rounded-xl font-sans font-semibold text-sm hover:bg-header/90 transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Taking you there…" : "Go to Dashboard →"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-sans">or explore with sample data</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Demo picker */}
      <div className="space-y-2 mb-3 text-left">
        {DEMO_PROPERTIES.map((demo) => (
          <button
            key={demo.key}
            type="button"
            onClick={() => setSelectedDemo(demo.key)}
            disabled={loading || seedLoading}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
              selectedDemo === demo.key
                ? "border-gold bg-gold/5"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <span className="text-2xl leading-none">{demo.flag}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium font-sans text-[#1a2332]">{demo.name}</p>
              <p className="text-xs text-gray-400 font-sans mt-0.5">{demo.description}</p>
            </div>
            {selectedDemo === demo.key && (
              <span className="w-4 h-4 rounded-full bg-gold flex-shrink-0 mt-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Load demo button */}
      <button
        onClick={loadSampleData}
        disabled={loading || seedLoading || !selectedDemo}
        className="w-full border border-gold text-gold py-2.5 rounded-xl font-sans font-semibold text-sm hover:bg-gold/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {seedLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner />
            Loading sample data…
          </span>
        ) : (
          "Load sample property →"
        )}
      </button>

      <p className="text-xs text-gray-400 font-sans mt-6">
        Need help?{" "}
        <a href="mailto:support@groundworkpm.com" className="text-gold hover:underline">
          support@groundworkpm.com
        </a>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STEP_TITLES   = ["Set up your property", "Add your units",  "All done!"];
const STEP_SUBTITLES = [
  "Tell us about your first property. You can add more later.",
  "Add the units inside your property. You can always add more later.",
  "Your account is ready to go.",
];

export default function OnboardingPage() {
  const { data: session } = useSession();
  const needsOrg = !session?.user?.organizationId;

  const [step,       setStep]       = useState(0);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [newOrgId,   setNewOrgId]   = useState<string | null>(null);

  function handlePropertyDone(pid: string, orgId: string | null) {
    setPropertyId(pid);
    if (orgId) setNewOrgId(orgId);
    setStep(1);
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-fit">
            <BrandLogo size={52} />
          </div>
          <p className="text-xs text-gray-400 font-sans">
            Step {step + 1} of 3 — {STEP_TITLES[step]}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card px-8 py-8">
          <Steps current={step} total={3} />

          <h2 className="font-display text-xl text-header mb-1">{STEP_TITLES[step]}</h2>
          <p className="text-xs text-gray-400 font-sans mb-6 leading-relaxed">
            {STEP_SUBTITLES[step]}
          </p>

          {step === 0 && (
            <StepProperty
              needsOrg={needsOrg}
              onNext={handlePropertyDone}
            />
          )}
          {step === 1 && propertyId && (
            <StepUnits
              propertyId={propertyId}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepDone newOrgId={newOrgId} />
          )}
        </div>
      </div>
    </div>
  );
}
