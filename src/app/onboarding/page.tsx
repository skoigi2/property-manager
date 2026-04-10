"use client";

import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-card px-8 py-10 text-center">
        <div className="w-14 h-14 bg-gold rounded-2xl mx-auto mb-5 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>

        <h1 className="font-display text-2xl text-header mb-2">Welcome to Property Manager</h1>
        <p className="text-sm text-gray-500 font-sans leading-relaxed mb-8">
          Your account has been created. Our team will be in touch shortly to help you
          set up your organisation and add your first properties.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-header text-white py-2.5 px-4 rounded-lg font-sans font-medium text-sm hover:bg-header/90 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        <p className="text-xs text-gray-400 font-sans mt-6">
          Need help? Email us at{" "}
          <a href="mailto:support@propertymanager.app" className="text-gold hover:underline">
            support@propertymanager.app
          </a>
        </p>
      </div>
    </div>
  );
}
