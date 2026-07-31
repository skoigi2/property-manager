"use client";

import { useState } from "react";

const DEMO_SUBJECT = "Book a demo";

const SUBJECTS = [
  DEMO_SUBJECT,
  "General enquiry",
  "Feature request",
  "Billing",
  "Bug report",
  "Partnership",
];

const TIME_WINDOWS = ["Mornings (8am–12pm)", "Afternoons (12–5pm)", "Evenings (after 5pm)"];

export function ContactForm({ defaultDemo = false }: { defaultDemo?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(defaultDemo ? DEMO_SUBJECT : "");

  const isDemo = subject === DEMO_SUBJECT;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const notes = ((fd.get("message") as string) ?? "").trim();

    // For demo requests, compose a structured message from the scheduling
    // fields so the support inbox has everything needed to confirm a slot.
    // This also guarantees the API's 20-char minimum even if notes are short.
    let message = notes;
    if (isDemo) {
      const times = fd.getAll("preferredTime").join(", ") || "Not specified";
      const timezone = ((fd.get("timezone") as string) ?? "").trim() || "Not specified";
      const portfolio = ((fd.get("portfolio") as string) ?? "").trim() || "Not specified";
      const phone = ((fd.get("phone") as string) ?? "").trim() || "—";
      message = [
        "Demo request.",
        `Preferred times: ${times}`,
        `Time zone: ${timezone}`,
        `Portfolio size: ${portfolio}`,
        `Phone / WhatsApp: ${phone}`,
        "",
        `Notes: ${notes || "(none)"}`,
      ].join("\n");
    }

    const body = {
      name:    fd.get("name") as string,
      email:   fd.get("email") as string,
      subject,
      message,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 dark:bg-green-950/40 mb-6">
          <svg className="w-8 h-8 text-income" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className=" text-h1 text-header dark:text-white mb-3">
          {isDemo ? "Demo request received!" : "Message sent!"}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-body max-w-sm mx-auto">
          {isDemo
            ? "Thanks! We'll email you 2–3 time options that fit your availability within 1 business day. Check your inbox for a confirmation."
            : "Thanks for reaching out. We'll reply within 1 business day. Check your inbox for a confirmation."}
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-white dark:bg-[#111F30] border border-gray-200 dark:border-white/10 rounded-lg px-4 py-3 text-body text-header dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60 transition-colors";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="Jane Smith"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="jane@example.com"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
          Subject <span className="text-red-400">*</span>
        </label>
        <select
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>Select a subject…</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Demo scheduling fields — only for "Book a demo" */}
      {isDemo && (
        <div className="space-y-5 rounded-xl border border-gold/30 bg-gold/5 dark:bg-gold/10 p-5">
          <div>
            <span className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2.5 uppercase ">
              When suits you? <span className=" normal-case text-gray-400">(pick any)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {TIME_WINDOWS.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 text-body text-header dark:text-white bg-white dark:bg-[#111F30] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:border-gold/50 transition-colors"
                >
                  <input type="checkbox" name="preferredTime" value={t} className="accent-gold" />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
                Time zone
              </label>
              <input name="timezone" type="text" placeholder="e.g. EAT (GMT+3)" className={inputClass} />
            </div>
            <div>
              <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
                Portfolio size
              </label>
              <input name="portfolio" type="text" placeholder="e.g. 25 properties" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
              Phone / WhatsApp <span className=" normal-case text-gray-400">(optional)</span>
            </label>
            <input name="phone" type="tel" placeholder="+254 700 000 000" className={inputClass} />
          </div>
        </div>
      )}

      <div>
        <label className="block text-label font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase ">
          {isDemo ? (
            <>Anything specific you&apos;d like to see? <span className=" normal-case text-gray-400">(optional)</span></>
          ) : (
            <>Message <span className="text-red-400">*</span></>
          )}
        </label>
        <textarea
          name="message"
          required={!isDemo}
          minLength={isDemo ? undefined : 20}
          rows={isDemo ? 4 : 6}
          placeholder={isDemo ? "e.g. owner reporting, arrears workflow, multi-currency…" : "Tell us what you need help with…"}
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <p className="text-body text-red-500 bg-red-50 dark:bg-red-950/40 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-header dark:bg-gold text-white dark:text-header font-semibold text-body px-8 py-3.5 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Sending…
          </>
        ) : (
          isDemo ? "Request my demo →" : "Send message →"
        )}
      </button>

      <p className="text-center text-caption text-gray-400 ">
        {isDemo
          ? "We'll email you a few time options within 1 business day."
          : "We typically reply within 1 business day."}
      </p>
    </form>
  );
}
