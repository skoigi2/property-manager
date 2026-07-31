"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  compareStrategies,
  interpretBreakeven,
  DEFAULT_INPUTS,
  type AirbnbInputs,
  type CalculatorInputs,
  type LongTermInputs,
} from "@/lib/rental-calculator";
import { formatCurrency, SUPPORTED_CURRENCIES } from "@/lib/currency";

// ─── Small UI primitives ──────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/tip align-middle print:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label={text}
        className="w-4 h-4 rounded-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-caption font-semibold flex items-center justify-center cursor-help"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-header dark:bg-black/90 text-white text-caption px-3 py-2 opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 transition-opacity duration-150 z-30 shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}

function formatNum(n: number, dp = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: 0 });
}

function parseNum(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

interface FieldProps {
  id: string;
  label: string;
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  max?: number;
  step?: number;
}

/** Numeric input with thousand-separator formatting and a tooltip. */
function NumberField({ id, label, tooltip, value, onChange, prefix, suffix, max }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const display = focused ? draft : formatNum(value, 2);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-1.5 text-caption font-medium text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <InfoTip text={tooltip} />
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption text-gray-400 dark:text-gray-500 pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={display}
          onFocus={() => {
            setDraft(value === 0 ? "" : String(value));
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            let n = parseNum(draft);
            if (max !== undefined) n = Math.min(n, max);
            onChange(Math.max(0, n));
          }}
          onChange={(e) => setDraft(e.target.value)}
          className={`w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-body text-header dark:text-white py-2 ${prefix ? "pl-10" : "pl-3"} ${suffix ? "pr-9" : "pr-3"} focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-shadow`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-gray-400 dark:text-gray-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl shadow-card p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

function ResultRow({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className={`text-body ${bold ? "font-semibold text-header dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>{label}</dt>
      <dd className={`text-body tabular-nums ${negative ? "text-expense" : bold ? "font-semibold text-header dark:text-white" : "text-gray-700 dark:text-gray-200"}`}>
        {value}
      </dd>
    </div>
  );
}

// ─── URL share serialisation ──────────────────────────────────────────────────

function encodeState(inputs: CalculatorInputs): string {
  const payload = JSON.stringify(inputs);
  // base64url so the query param survives sharing apps
  return btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(s: string): CalculatorInputs | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!parsed?.longTerm || !parsed?.airbnb) return null;
    // Merge over defaults so missing/extra keys can't break calculations
    return {
      longTerm: { ...DEFAULT_INPUTS.longTerm, ...sanitize(parsed.longTerm) } as LongTermInputs,
      airbnb: { ...DEFAULT_INPUTS.airbnb, ...sanitize(parsed.airbnb) } as AirbnbInputs,
      hasslePremiumMonthly: num(parsed.hasslePremiumMonthly, DEFAULT_INPUTS.hasslePremiumMonthly),
      currency: typeof parsed.currency === "string" ? parsed.currency : "USD",
    };
  } catch {
    return null;
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitize(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

// ─── Main component ───────────────────────────────────────────────────────────

const HASSLE_PRESETS = [0, 250, 500, 750];

export function AirbnbVsLtrCalculator() {
  const [longTerm, setLongTerm] = useState<LongTermInputs>(DEFAULT_INPUTS.longTerm);
  const [airbnb, setAirbnb] = useState<AirbnbInputs>(DEFAULT_INPUTS.airbnb);
  const [hassle, setHassle] = useState(DEFAULT_INPUTS.hasslePremiumMonthly);
  const [currency, setCurrency] = useState("USD");
  const [showLtAdvanced, setShowLtAdvanced] = useState(false);
  const [showAbAdvanced, setShowAbAdvanced] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Lead form state
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [leadError, setLeadError] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from a shared link (?s=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("s");
    if (shared) {
      const decoded = decodeState(shared);
      if (decoded) {
        setLongTerm(decoded.longTerm);
        setAirbnb(decoded.airbnb);
        setHassle(decoded.hasslePremiumMonthly);
        setCurrency(decoded.currency);
      }
    }
  }, []);

  const inputs: CalculatorInputs = useMemo(
    () => ({ longTerm, airbnb, hasslePremiumMonthly: hassle, currency }),
    [longTerm, airbnb, hassle, currency]
  );

  const result = useMemo(() => compareStrategies(inputs), [inputs]);
  const interpretation = useMemo(() => interpretBreakeven(result.breakevenOccupancyPct), [result.breakevenOccupancyPct]);

  const fmt = (n: number) => formatCurrency(Math.round(n), currency);
  const symbol = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const setLt = (patch: Partial<LongTermInputs>) => setLongTerm((p) => ({ ...p, ...patch }));
  const setAb = (patch: Partial<AirbnbInputs>) => setAirbnb((p) => ({ ...p, ...patch }));

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?s=${encodeState(inputs)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Airbnb vs Long-Term Rental Calculator", url });
        return;
      }
    } catch {
      /* user cancelled — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable link copied to clipboard");
    } catch {
      showToast("Couldn't copy — please copy the URL from the address bar");
    }
  };

  const handleCopyResults = async () => {
    const be = result.breakevenOccupancyPct;
    const text = [
      "Airbnb vs Long-Term Rental — GroundWorkPM Calculator",
      "",
      `Long-term rental monthly NOI: ${fmt(result.longTerm.monthlyNoi)}`,
      `Airbnb monthly NOI: ${fmt(result.airbnb.monthlyNoi)}`,
      `Annual difference (Airbnb − long-term): ${fmt(result.annualAdvantage)}`,
      `Airbnb breakeven occupancy: ${be === null ? "not reachable with these assumptions" : `${be.toFixed(1)}%`}`,
      `Hassle premium: ${fmt(hassle)}/month`,
      `Verdict: ${result.verdict === "AIRBNB_WINS" ? "Airbnb wins" : result.verdict === "LONG_TERM_WINS" ? "Long-term rental wins" : "Too close to call"}`,
      "",
      `Run your own numbers: ${window.location.origin}${window.location.pathname}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Results copied to clipboard");
    } catch {
      showToast("Couldn't access the clipboard");
    }
  };

  const handleReset = () => {
    setLongTerm(DEFAULT_INPUTS.longTerm);
    setAirbnb(DEFAULT_INPUTS.airbnb);
    setHassle(DEFAULT_INPUTS.hasslePremiumMonthly);
    setCurrency("USD");
    window.history.replaceState(null, "", window.location.pathname);
    showToast("Calculator reset to defaults");
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leadStatus === "sending") return;
    setLeadStatus("sending");
    setLeadError("");
    try {
      const res = await fetch("/api/calculator-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, inputs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLeadStatus("error");
        setLeadError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setLeadStatus("sent");
    } catch {
      setLeadStatus("error");
      setLeadError("Network error — please try again.");
    }
  };

  // ─── Derived display values ─────────────────────────────────────────────────

  const breakeven = result.breakevenOccupancyPct;
  const ltWins = result.verdict === "LONG_TERM_WINS";
  const abWins = result.verdict === "AIRBNB_WINS";
  const monthlyDiff = result.airbnb.monthlyNoi - result.longTerm.monthlyNoi;

  return (
    <div className="relative" id="calculator">
      {/* print styles */}
      <style>{`@media print { nav, footer, .print\\:hidden { display: none !important; } body { background: white !important; } }`}</style>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-header text-white text-body px-5 py-3 rounded-xl shadow-lg animate-[fadeIn_.2s_ease-out] print:hidden" role="status">
          {toast}
        </div>
      )}

      {/* ── Toolbar: currency + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <label className="flex items-center gap-2 text-body text-gray-600 dark:text-gray-300">
          <span className="font-medium">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Select currency"
            className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-body text-header dark:text-white py-2 px-3 focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleShare} className="text-caption font-medium border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 rounded-lg px-3.5 py-2 hover:border-gold hover:text-gold-dark dark:hover:text-gold transition-colors">
            Share results
          </button>
          <button onClick={handleCopyResults} className="text-caption font-medium border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 rounded-lg px-3.5 py-2 hover:border-gold hover:text-gold-dark dark:hover:text-gold transition-colors">
            Copy results
          </button>
          <button onClick={() => window.print()} className="text-caption font-medium border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 rounded-lg px-3.5 py-2 hover:border-gold hover:text-gold-dark dark:hover:text-gold transition-colors">
            Print
          </button>
          <button onClick={handleReset} className="text-caption font-medium border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 rounded-lg px-3.5 py-2 hover:border-expense hover:text-expense transition-colors">
            Reset calculator
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,380px] gap-8 items-start">
        {/* ════════ LEFT: inputs ════════ */}
        <div className="space-y-6 min-w-0">
          {/* Long-term assumptions */}
          <SectionCard>
            <h3 className="text-h3 text-header dark:text-white mb-1">Long-Term Rental Assumptions</h3>
            <p className="text-caption text-gray-400 dark:text-gray-500 mb-4">A 12-month tenancy at a fixed monthly rent.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField id="lt-rent" label="Monthly rent" tooltip="The market rent you would charge a long-term tenant per month, before any costs." value={longTerm.monthlyRent} onChange={(v) => setLt({ monthlyRent: v })} prefix={symbol} />
              <NumberField id="lt-vacancy" label="Vacancy rate" tooltip="The share of the year you expect the unit to sit empty between tenants. 5–8% is typical for healthy markets." value={longTerm.vacancyRatePct} onChange={(v) => setLt({ vacancyRatePct: v })} suffix="%" max={100} />
              <NumberField id="lt-mgmt" label="Property management fee" tooltip="What a letting agent or property manager charges, as a percentage of collected rent. 8–12% is common." value={longTerm.managementFeePct} onChange={(v) => setLt({ managementFeePct: v })} suffix="%" max={100} />
              <NumberField id="lt-taxes" label="Annual property taxes" tooltip="Total property taxes, rates, or land levies per year." value={longTerm.annualPropertyTaxes} onChange={(v) => setLt({ annualPropertyTaxes: v })} prefix={symbol} />
              <NumberField id="lt-insurance" label="Annual insurance" tooltip="Landlord insurance premium per year." value={longTerm.annualInsurance} onChange={(v) => setLt({ annualInsurance: v })} prefix={symbol} />
              <NumberField id="lt-repairs" label="Annual repairs & maintenance" tooltip="Day-to-day repairs: plumbing, appliances, paint touch-ups. A common rule of thumb is 1% of property value per year." value={longTerm.annualRepairs} onChange={(v) => setLt({ annualRepairs: v })} prefix={symbol} />
              <NumberField id="lt-capex" label="Annual CapEx reserve" tooltip="Money set aside for big-ticket replacements — roof, HVAC, water heater — so they don't surprise you." value={longTerm.annualCapexReserve} onChange={(v) => setLt({ annualCapexReserve: v })} prefix={symbol} />
              <NumberField id="lt-hoa" label="Annual HOA / service charges" tooltip="Homeowner association dues or building service charges per year." value={longTerm.annualHoaFees} onChange={(v) => setLt({ annualHoaFees: v })} prefix={symbol} />
            </div>
            <button type="button" onClick={() => setShowLtAdvanced((s) => !s)} className="mt-4 text-caption font-medium text-gold-dark dark:text-gold hover:underline print:hidden">
              {showLtAdvanced ? "− Hide" : "+ Show"} other expenses
            </button>
            {showLtAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <NumberField id="lt-other" label="Other annual expenses" tooltip="Anything else: accounting, licences, legal fees, bank charges." value={longTerm.annualOtherExpenses} onChange={(v) => setLt({ annualOtherExpenses: v })} prefix={symbol} />
              </div>
            )}
          </SectionCard>

          {/* Airbnb assumptions */}
          <SectionCard>
            <h3 className="text-h3 text-header dark:text-white mb-1">Airbnb Assumptions</h3>
            <p className="text-caption text-gray-400 dark:text-gray-500 mb-4">
              Short-term letting is a separate business with its own cost structure — don&apos;t estimate it from monthly rent.
            </p>
            <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500 mb-3">Revenue</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumberField id="ab-rate" label="Average nightly rate" tooltip="Your realistic average daily rate across the whole year — high season and low season blended." value={airbnb.nightlyRate} onChange={(v) => setAb({ nightlyRate: v })} prefix={symbol} />
              <NumberField id="ab-occ" label="Occupancy rate" tooltip="Percentage of nights actually booked across the year. Most markets average 50–70%; check AirDNA or local listings." value={airbnb.occupancyRatePct} onChange={(v) => setAb({ occupancyRatePct: v })} suffix="%" max={100} />
              <NumberField id="ab-stay" label="Average length of stay" tooltip="Average nights per booking. Shorter stays mean more turnovers and more cleaning costs." value={airbnb.avgStayNights} onChange={(v) => setAb({ avgStayNights: v })} suffix="nights" />
            </div>

            <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500 mt-6 mb-3">Operating costs</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField id="ab-cleaning" label="Cleaning cost per turnover" tooltip="What you pay a cleaner per changeover — even if guests pay a cleaning fee, your cost is what matters here." value={airbnb.cleaningCostPerTurnover} onChange={(v) => setAb({ cleaningCostPerTurnover: v })} prefix={symbol} />
              <NumberField id="ab-utilities" label="Utilities per month" tooltip="Electricity, water, gas — you pay these on Airbnb, unlike most long-term leases." value={airbnb.monthlyUtilities} onChange={(v) => setAb({ monthlyUtilities: v })} prefix={symbol} />
              <NumberField id="ab-internet" label="Internet / TV per month" tooltip="Fast Wi-Fi and streaming are expected by guests and reviewed harshly when missing." value={airbnb.monthlyInternet} onChange={(v) => setAb({ monthlyInternet: v })} prefix={symbol} />
              <NumberField id="ab-supplies" label="Supplies per month" tooltip="Toiletries, coffee, linen replacement, light bulbs — consumables guests use up." value={airbnb.monthlySupplies} onChange={(v) => setAb({ monthlySupplies: v })} prefix={symbol} />
              <NumberField id="ab-platform" label="Platform fees" tooltip="Airbnb's host service fee is ~3% (split-fee) or ~14–16% (host-only). Booking.com charges ~15%." value={airbnb.platformFeePct} onChange={(v) => setAb({ platformFeePct: v })} suffix="%" max={100} />
              <NumberField id="ab-lodging" label="Lodging / tourism tax" tooltip="Occupancy or tourism taxes you owe on gross revenue, where not collected by the platform." value={airbnb.lodgingTaxPct} onChange={(v) => setAb({ lodgingTaxPct: v })} suffix="%" max={100} />
              <NumberField id="ab-mgmt" label="Property management fee" tooltip="Short-let managers charge 15–25% of revenue — far more than long-term, because the workload is far higher." value={airbnb.managementFeePct} onChange={(v) => setAb({ managementFeePct: v })} suffix="%" max={100} />
              <NumberField id="ab-taxes" label="Annual property taxes" tooltip="Same property, same taxes — unless your jurisdiction taxes short-term rentals differently." value={airbnb.annualPropertyTaxes} onChange={(v) => setAb({ annualPropertyTaxes: v })} prefix={symbol} />
              <NumberField id="ab-insurance" label="Annual insurance" tooltip="Short-term rental insurance typically costs 30–50% more than standard landlord cover." value={airbnb.annualInsurance} onChange={(v) => setAb({ annualInsurance: v })} prefix={symbol} />
              <NumberField id="ab-repairs" label="Annual repairs & maintenance" tooltip="Higher guest turnover means more wear: expect noticeably higher repair costs than a long-term let." value={airbnb.annualRepairs} onChange={(v) => setAb({ annualRepairs: v })} prefix={symbol} />
              <NumberField id="ab-furnishing" label="Annual furnishing reserve" tooltip="Furniture, mattresses, and décor wear out fast with weekly guests. Budget to replace them on a cycle." value={airbnb.annualFurnishingReserve} onChange={(v) => setAb({ annualFurnishingReserve: v })} prefix={symbol} />
              <NumberField id="ab-hoa" label="Annual HOA / service charges" tooltip="Building dues — confirm your building actually allows short-term letting first." value={airbnb.annualHoaFees} onChange={(v) => setAb({ annualHoaFees: v })} prefix={symbol} />
            </div>
            <button type="button" onClick={() => setShowAbAdvanced((s) => !s)} className="mt-4 text-caption font-medium text-gold-dark dark:text-gold hover:underline print:hidden">
              {showAbAdvanced ? "− Hide" : "+ Show"} other expenses
            </button>
            {showAbAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <NumberField id="ab-other" label="Other annual expenses" tooltip="Licences, permits, accounting, pricing tools, guest screening services." value={airbnb.annualOtherExpenses} onChange={(v) => setAb({ annualOtherExpenses: v })} prefix={symbol} />
              </div>
            )}
          </SectionCard>

          {/* Hassle premium */}
          <SectionCard>
            <h3 className="text-h3 text-header dark:text-white mb-1">
              What extra profit would Airbnb need to generate before the additional effort feels worthwhile?
            </h3>
            <p className="text-caption text-gray-400 dark:text-gray-500 mb-5">
              This reflects the value of your time, stress, operational complexity, and peace of mind.
            </p>
            <div className="flex flex-wrap gap-2 mb-4 print:hidden">
              {HASSLE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setHassle(p)}
                  className={`text-caption font-medium rounded-lg px-3.5 py-2 border transition-colors ${
                    hassle === p
                      ? "bg-header dark:bg-gold text-white dark:text-header border-header dark:border-gold"
                      : "border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 hover:border-gold"
                  }`}
                >
                  {formatCurrency(p, currency)}/mo
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={2000}
                step={25}
                value={Math.min(hassle, 2000)}
                onChange={(e) => setHassle(Number(e.target.value))}
                aria-label="Hassle premium per month"
                className="flex-1 accent-[#C9A84C] h-2"
              />
              <span className="tabular-nums text-body font-semibold text-header dark:text-white whitespace-nowrap w-32 text-right">
                {fmt(hassle)}/mo
              </span>
            </div>
            <p className="text-caption text-gray-500 dark:text-gray-400 mt-4 ">
              After accounting for your hassle premium, Airbnb would need to generate an additional{" "}
              <strong className="text-header dark:text-white">{fmt(result.hasslePremiumAnnual)}</strong> annually to justify the extra work.
            </p>
          </SectionCard>
        </div>

        {/* ════════ RIGHT: sticky results ════════ */}
        <aside className="lg:sticky lg:top-24 space-y-4 min-w-0" aria-label="Comparison results">
          {/* Comparison cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border-2 p-4 transition-colors duration-300 ${ltWins ? "border-gold bg-gold/5" : "border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.04]"}`}>
              <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500">Long-term</p>
              <p className="tabular-nums text-h2 sm:text-h1 text-header dark:text-white mt-1  break-words">{fmt(result.longTerm.monthlyNoi)}</p>
              <p className="text-caption text-gray-400 dark:text-gray-500">net per month</p>
              {ltWins && <p className="mt-2 text-caption font-semibold text-gold-dark dark:text-gold">★ Recommended</p>}
            </div>
            <div className={`rounded-2xl border-2 p-4 transition-colors duration-300 ${abWins ? "border-gold bg-gold/5" : "border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.04]"}`}>
              <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500">Airbnb</p>
              <p className="tabular-nums text-h2 sm:text-h1 text-header dark:text-white mt-1  break-words">{fmt(result.airbnb.monthlyNoi)}</p>
              <p className="text-caption text-gray-400 dark:text-gray-500">net per month</p>
              {abWins && <p className="mt-2 text-caption font-semibold text-gold-dark dark:text-gold">★ Recommended</p>}
            </div>
          </div>

          <SectionCard className="!p-5">
            <p className="text-caption text-gray-500 dark:text-gray-400 mb-1">Airbnb vs long-term difference</p>
            <p className={`tabular-nums text-h3 ${monthlyDiff >= 0 ? "text-income" : "text-expense"}`}>
              {monthlyDiff >= 0 ? "+" : "−"}{fmt(Math.abs(monthlyDiff))}/month
            </p>

            <hr className="my-4 border-gray-100 dark:border-white/10" />

            <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500 mb-1">Long-term rental</p>
            <dl>
              <ResultRow label="Effective gross income" value={fmt(result.longTerm.effectiveGrossIncome)} />
              <ResultRow label="Annual expenses" value={fmt(result.longTerm.totalOperatingExpenses)} />
              <ResultRow label="Annual NOI" value={fmt(result.longTerm.annualNoi)} bold negative={result.longTerm.annualNoi < 0} />
              <ResultRow label="Monthly NOI" value={fmt(result.longTerm.monthlyNoi)} negative={result.longTerm.monthlyNoi < 0} />
            </dl>

            <hr className="my-4 border-gray-100 dark:border-white/10" />

            <p className="text-label uppercase font-semibold text-gray-400 dark:text-gray-500 mb-1">Airbnb</p>
            <dl>
              <ResultRow label="Gross revenue" value={fmt(result.airbnb.grossRevenue)} />
              <ResultRow label="Operating expenses" value={fmt(result.airbnb.totalOperatingExpenses)} />
              <ResultRow label="Annual NOI" value={fmt(result.airbnb.annualNoi)} bold negative={result.airbnb.annualNoi < 0} />
              <ResultRow label="Monthly NOI" value={fmt(result.airbnb.monthlyNoi)} negative={result.airbnb.monthlyNoi < 0} />
              <ResultRow label="Guest turnovers / year" value={formatNum(result.airbnb.turnovers)} />
            </dl>
          </SectionCard>
        </aside>
      </div>

      {/* ════════ AHA: Breakeven occupancy ════════ */}
      <section aria-labelledby="breakeven-heading" className="mt-14">
        <div className="rounded-3xl bg-header dark:bg-[#091525] text-white p-7 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gold/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <p className="text-gold text-label font-semibold uppercase mb-3">The number that decides it</p>
          <h2 id="breakeven-heading" className="text-h1 mb-6">Airbnb Breakeven Occupancy</h2>

          {breakeven !== null ? (
            <>
              <p className="text-display text-gold tabular-nums">{breakeven.toFixed(0)}%</p>
              <p className="text-gray-300 text-body-lg mt-4 max-w-2xl ">
                Airbnb must achieve approximately <strong className="text-white">{breakeven.toFixed(1)}% occupancy</strong> just to match
                the profits of long-term renting.
              </p>

              {/* gauge */}
              <div className="mt-8 max-w-2xl">
                <div className="relative h-4 rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-dark to-gold transition-all duration-500"
                    style={{ width: `${Math.min(100, airbnb.occupancyRatePct)}%` }}
                  />
                  <div
                    className="absolute -top-1.5 h-7 w-1 rounded bg-white transition-all duration-500"
                    style={{ left: `${Math.min(100, breakeven)}%` }}
                    title={`Breakeven: ${breakeven.toFixed(1)}%`}
                  />
                </div>
                <div className="flex justify-between text-caption text-gray-400 mt-2">
                  <span>0%</span>
                  <span className="text-white font-medium">▲ breakeven {breakeven.toFixed(0)}% · your estimate {airbnb.occupancyRatePct.toFixed(0)}%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-5 max-w-2xl">
                <p className="font-semibold text-gold">{interpretation.headline}</p>
                <p className="text-body text-gray-300 mt-2 ">
                  If your market only works at very high occupancy levels, even small downturns can eliminate Airbnb&apos;s advantage.
                </p>
              </div>
            </>
          ) : (
            <div className="max-w-2xl">
              <p className="tabular-nums text-display text-gold">N/A</p>
              <p className="text-gray-300 text-body-lg mt-4 ">{interpretation.headline}</p>
              <p className="text-body text-gray-400 mt-3">
                With these costs and rates, no occupancy level lets Airbnb match the long-term result. Revisit your nightly rate or cost assumptions.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ════════ Operational reality ════════ */}
      <section aria-labelledby="ops-heading" className="mt-12">
        <h2 id="ops-heading" className="text-h1 text-header dark:text-white mb-2">
          What that occupancy actually means, operationally
        </h2>
        <p className="text-body text-gray-500 dark:text-gray-400 mb-6 max-w-2xl">
          To achieve this occupancy target, you would likely need approximately:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { n: formatNum(result.airbnb.bookedNights), label: "booked nights annually" },
            { n: formatNum(result.airbnb.turnovers), label: "guest turnovers annually" },
            { n: formatNum(result.airbnb.turnovers), label: "cleaning schedules annually" },
            { n: formatNum(result.airbnb.turnovers * 2), label: "check-ins & check-outs annually" },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 text-center">
              <p className="tabular-nums text-h1 text-header dark:text-white ">{s.n}</p>
              <p className="text-caption text-gray-400 dark:text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {["Ongoing guest communications", "Continuous pricing & availability management"].map((t) => (
            <span key={t} className="text-caption text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 rounded-full px-4 py-2">{t}</span>
          ))}
        </div>
        <p className="text-h2 sm:text-h1 text-header dark:text-white mt-8">
          This isn&apos;t passive income. It&apos;s a hospitality business.
        </p>
      </section>

      {/* ════════ Recommendation ════════ */}
      <section aria-labelledby="verdict-heading" className="mt-12">
        <SectionCard className="!p-7 sm:!p-9 border-2 !border-gold/40">
          <p className="text-gold-dark dark:text-gold text-label font-semibold uppercase mb-2">Our hassle-adjusted recommendation</p>
          {result.verdict === "LONG_TERM_WINS" && (
            <>
              <h2 id="verdict-heading" className="text-h1 text-header dark:text-white">Long-Term Rental Wins</h2>
              <p className="text-body text-gray-600 dark:text-gray-300 mt-3 max-w-2xl ">
                Long-term renting produces similar profits with substantially lower operational complexity.
              </p>
              <ul className="mt-5 grid sm:grid-cols-2 gap-2 text-body text-gray-600 dark:text-gray-300 max-w-2xl">
                {["Predictable income", "Lower vacancy risk", "Fewer operational demands", "Reduced turnover costs"].map((b) => (
                  <li key={b} className="flex items-center gap-2"><span className="text-gold">✓</span>{b}</li>
                ))}
              </ul>
            </>
          )}
          {result.verdict === "AIRBNB_WINS" && (
            <>
              <h2 id="verdict-heading" className="text-h1 text-header dark:text-white">Airbnb Wins Convincingly</h2>
              <p className="text-body text-gray-600 dark:text-gray-300 mt-3 max-w-2xl ">
                Even after accounting for the additional effort, Airbnb significantly outperforms long-term renting —
                an extra <strong>{fmt(result.hassleAdjustedAdvantage)}</strong> per year after your hassle premium.
              </p>
              {result.breakevenOccupancyPct !== null && (
                <p className="text-body text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
                  This advantage depends on maintaining occupancy above {result.breakevenOccupancyPct.toFixed(0)}%.
                </p>
              )}
            </>
          )}
          {result.verdict === "TOO_CLOSE" && (
            <>
              <h2 id="verdict-heading" className="text-h1 text-header dark:text-white">Too Close to Call</h2>
              <p className="text-body text-gray-600 dark:text-gray-300 mt-3 max-w-2xl ">
                Airbnb generates only modest additional profits. If occupancy falls slightly, long-term renting becomes more profitable.
              </p>
              <p className="text-body text-gray-500 dark:text-gray-400 mt-2 max-w-2xl ">
                Many investors choose long-term rentals in this situation because the income is simpler and easier to manage.
              </p>
            </>
          )}
        </SectionCard>
      </section>

      {/* ════════ Stress test ════════ */}
      <section aria-labelledby="stress-heading" className="mt-12">
        <h2 id="stress-heading" className="text-h1 text-header dark:text-white mb-2">Stress Test Analysis</h2>
        <p className="text-body text-gray-500 dark:text-gray-400 mb-6 max-w-2xl">
          What happens to the Airbnb result when conditions move against you?
        </p>

        {/* mobile cards */}
        <div className="md:hidden space-y-3">
          {result.stressTests.map((s) => (
            <div key={s.key} className={`rounded-xl border p-4 ${s.diffVsLongTerm < 0 ? "border-expense/30 bg-expense/5" : "border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.04]"}`}>
              <p className="text-body font-medium text-header dark:text-white">{s.label}</p>
              <div className="flex justify-between mt-2 text-body">
                <span className="text-gray-400 dark:text-gray-500 text-caption">Airbnb NOI</span>
                <span className="tabular-nums text-gray-700 dark:text-gray-200">{fmt(s.airbnbAnnualNoi)}</span>
              </div>
              <div className="flex justify-between mt-1 text-body">
                <span className="text-gray-400 dark:text-gray-500 text-caption">vs long-term</span>
                <span className={`tabular-nums font-semibold ${s.diffVsLongTerm < 0 ? "text-expense" : "text-income"}`}>
                  {s.diffVsLongTerm >= 0 ? "+" : "−"}{fmt(Math.abs(s.diffVsLongTerm))}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 dark:border-white/10">
          <table className="w-full text-body bg-white dark:bg-white/[0.04]">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/5 text-left">
                <th scope="col" className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Scenario</th>
                <th scope="col" className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Adjusted Airbnb NOI (annual)</th>
                <th scope="col" className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Difference vs long-term</th>
              </tr>
            </thead>
            <tbody>
              {result.stressTests.map((s) => (
                <tr key={s.key} className={`border-t border-gray-100 dark:border-white/10 ${s.diffVsLongTerm < 0 ? "bg-expense/5" : ""}`}>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200">{s.label}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmt(s.airbnbAnnualNoi)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${s.diffVsLongTerm < 0 ? "text-expense" : "text-income"}`}>
                    {s.diffVsLongTerm >= 0 ? "+" : "−"}{fmt(Math.abs(s.diffVsLongTerm))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {breakeven !== null && (
          <p className="text-body text-gray-600 dark:text-gray-300 mt-5 bg-gold/10 border border-gold/30 rounded-xl px-5 py-4 max-w-3xl">
            Your Airbnb strategy becomes less profitable than long-term renting if occupancy falls below{" "}
            <strong className="text-header dark:text-white">{breakeven.toFixed(0)}%</strong>.
          </p>
        )}
      </section>

      {/* ════════ Lead magnet ════════ */}
      <section aria-labelledby="report-heading" className="mt-14 print:hidden">
        <div className="rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-7 sm:p-10">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 id="report-heading" className="text-h1 text-header dark:text-white">Want the Full Investment Analysis?</h2>
              <p className="text-body text-gray-600 dark:text-gray-300 mt-2">Get a personalised investor report delivered to your inbox.</p>
              <ul className="mt-5 space-y-2 text-body text-gray-600 dark:text-gray-300">
                {[
                  "Detailed PDF analysis",
                  "10-year profit comparison",
                  "Occupancy sensitivity analysis",
                  "Low-season stress testing",
                  "Hassle-adjusted recommendations",
                  "Major investment risks identified",
                  "Shareable report for spouses, partners, or lenders",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2"><span className="text-gold mt-0.5">✓</span>{b}</li>
                ))}
              </ul>
            </div>
            <div>
              {leadStatus === "sent" ? (
                <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-7 text-center">
                  <p className="text-h1 mb-3">📬</p>
                  <h3 className="text-h2 text-header dark:text-white">Your report is on its way</h3>
                  <p className="text-body text-gray-500 dark:text-gray-400 mt-2">
                    Check your inbox in the next couple of minutes — and your spam folder, just in case.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-6 sm:p-7 space-y-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="lead-name" className="text-caption font-medium text-gray-600 dark:text-gray-300">First name</label>
                    <input
                      id="lead-name" type="text" required maxLength={80} value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-body text-header dark:text-white py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-gold/50"
                      placeholder="Jane"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="lead-email" className="text-caption font-medium text-gray-600 dark:text-gray-300">Email address</label>
                    <input
                      id="lead-email" type="email" required maxLength={200} value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-body text-header dark:text-white py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-gold/50"
                      placeholder="jane@example.com"
                    />
                  </div>
                  {leadStatus === "error" && <p className="text-caption text-expense">{leadError}</p>}
                  <button
                    type="submit"
                    disabled={leadStatus === "sending"}
                    className="w-full bg-header dark:bg-gold text-white dark:text-header text-body font-semibold py-3 rounded-xl hover:bg-header/90 dark:hover:bg-gold/90 transition-colors disabled:opacity-60"
                  >
                    {leadStatus === "sending" ? "Preparing your report…" : "Email My Free Investor Report"}
                  </button>
                  <p className="text-caption text-gray-400 dark:text-gray-500 ">
                    We&apos;ll occasionally send practical property investment insights. You can unsubscribe anytime.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ GroundWorkPM CTA ════════ */}
      <section aria-labelledby="gwpm-heading" className="mt-14 print:hidden">
        <h2 id="gwpm-heading" className="text-h1 text-header dark:text-white text-center max-w-3xl mx-auto">
          You Know Which Strategy Fits Your Investment Goals. Now Run It Efficiently.
        </h2>
        <p className="text-body text-gray-500 dark:text-gray-400 text-center mt-3 max-w-2xl mx-auto">
          Whichever way you go, the winners treat their property like a business — with real numbers, not guesswork.
          GroundWorkPM is the operating system for exactly that.
        </p>
        <div className="grid md:grid-cols-2 gap-4 mt-8 max-w-3xl mx-auto">
          <div className={`rounded-2xl border p-6 ${ltWins ? "border-gold bg-gold/5" : "border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.04]"}`}>
            <h3 className="text-h3 text-header dark:text-white mb-3">For long-term rentals</h3>
            <ul className="space-y-2 text-body text-gray-600 dark:text-gray-300">
              {["Track rent payments", "Manage maintenance", "Monitor expenses", "Generate owner reports", "Eliminate spreadsheets"].map((b) => (
                <li key={b} className="flex items-center gap-2"><span className="text-gold">✓</span>{b}</li>
              ))}
            </ul>
          </div>
          <div className={`rounded-2xl border p-6 ${abWins ? "border-gold bg-gold/5" : "border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.04]"}`}>
            <h3 className="text-h3 text-header dark:text-white mb-3">For Airbnb &amp; short lets</h3>
            <ul className="space-y-2 text-body text-gray-600 dark:text-gray-300">
              {["Track booking income", "Monitor operating costs", "Coordinate maintenance", "Understand true profitability", "Run your property like a business"].map((b) => (
                <li key={b} className="flex items-center gap-2"><span className="text-gold">✓</span>{b}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link href="/examples" className="w-full sm:w-auto text-center bg-header dark:bg-gold text-white dark:text-header text-body font-semibold px-8 py-3.5 rounded-xl hover:bg-header/90 dark:hover:bg-gold/90 transition-colors">
            See How GroundWorkPM Works
          </Link>
          <Link href="/signup" className="w-full sm:w-auto text-center border border-gray-300 dark:border-white/20 text-header dark:text-white text-body font-semibold px-8 py-3.5 rounded-xl hover:border-gold hover:text-gold-dark dark:hover:text-gold transition-colors">
            Start Free
          </Link>
        </div>
      </section>
    </div>
  );
}
