"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header Card */}
        <div className="bg-header rounded-t-2xl px-8 py-8 text-center">
          <div className="w-12 h-12 bg-gold rounded-xl mx-auto mb-4 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1 className="font-display text-2xl text-white">Groundwork PM</h1>
          <p className="text-white/60 text-sm mt-1 font-sans">Reset your password</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-b-2xl px-8 py-8 shadow-card">
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-display text-lg text-header mb-2">Check your email</h2>
              <p className="text-sm text-gray-500 font-sans mb-6 leading-relaxed">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <Link href="/login" className="text-sm text-header font-medium hover:underline font-sans">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-lg text-header mb-2">Forgot your password?</h2>
              <p className="text-sm text-gray-500 font-sans mb-6 leading-relaxed">
                Enter your email address and we&apos;ll send you a link to reset it.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-header text-white py-2.5 px-4 rounded-lg font-sans font-medium text-sm hover:bg-header/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending…
                    </span>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </form>
              <p className="text-xs text-gray-400 text-center mt-6 font-sans">
                <Link href="/login" className="text-header font-medium hover:underline">
                  ← Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
