"use client";

import { useState } from "react";

const SUBJECTS = [
  "General enquiry",
  "Feature request",
  "Billing",
  "Bug report",
  "Partnership",
];

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const body = {
      name:    fd.get("name") as string,
      email:   fd.get("email") as string,
      subject: fd.get("subject") as string,
      message: fd.get("message") as string,
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
        <h3 className="font-display text-2xl text-header dark:text-white mb-3">Message sent!</h3>
        <p className="text-gray-500 dark:text-gray-400 font-sans text-sm leading-relaxed max-w-sm mx-auto">
          Thanks for reaching out. We&apos;ll reply within 1 business day. Check your inbox for a confirmation.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-white dark:bg-[#111F30] border border-gray-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm font-sans text-header dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60 transition-colors";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-sans mb-2 uppercase tracking-wide">
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
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-sans mb-2 uppercase tracking-wide">
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
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-sans mb-2 uppercase tracking-wide">
          Subject <span className="text-red-400">*</span>
        </label>
        <select name="subject" required defaultValue="" className={inputClass}>
          <option value="" disabled>Select a subject…</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-sans mb-2 uppercase tracking-wide">
          Message <span className="text-red-400">*</span>
        </label>
        <textarea
          name="message"
          required
          minLength={20}
          rows={6}
          placeholder="Tell us what you need help with…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 font-sans bg-red-50 dark:bg-red-950/40 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-header dark:bg-gold text-white dark:text-header font-semibold text-sm px-8 py-3.5 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
          "Send message →"
        )}
      </button>

      <p className="text-center text-xs text-gray-400 font-sans">
        We typically reply within 1 business day.
      </p>
    </form>
  );
}
