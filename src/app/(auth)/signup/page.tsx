"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function SignupPage() {
  const [form, setForm] = useState({
    name:             "",
    email:            "",
    password:         "",
    organizationName: "",
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Signup failed. Please try again.");
        return;
      }
      // Auto sign-in after account creation
      const result = await signIn("credentials", {
        email:    form.email,
        password: form.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Account created — please sign in.");
        window.location.href = "/login";
      } else {
        window.location.href = "/onboarding";
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/onboarding" });
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
          <p className="text-white/60 text-sm mt-1 font-sans">Property insights. Built on solid groundwork.</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-b-2xl px-8 py-8 shadow-card">
          <h2 className="font-display text-lg text-header mb-6">Create your account</h2>

          {/* Google sign-up */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 bg-white text-gray-700 py-2.5 px-4 rounded-lg font-sans font-medium text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mb-5"
          >
            {googleLoading ? (
              <svg className="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
            )}
            {googleLoading ? "Redirecting…" : "Sign up with Google"}
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-sans">or sign up with email</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Your name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Company / agency name</label>
              <input
                type="text"
                value={form.organizationName}
                onChange={(e) => update("organizationName", e.target.value)}
                placeholder="Oakwood Property Group"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-gold text-header py-2.5 px-4 rounded-lg font-sans font-semibold text-sm hover:bg-gold/90 active:bg-gold/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </span>
              ) : (
                "Start free trial — no card required"
              )}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6 font-sans">
            Already have an account?{" "}
            <Link href="/login" className="text-header font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
