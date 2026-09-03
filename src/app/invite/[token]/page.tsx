"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

interface InviteDetails {
  email: string;
  role: string;
  orgName: string;
  inviterName: string;
  expiresAt: string;
  /** Already applied (e.g. auto-joined at sign-in) — the member just needs sending on. */
  accepted?: boolean;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setFetchError(data.error);
        else setDetails(data);
      })
      .catch(() => setFetchError("Failed to load invitation details."));
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    const res  = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setFetchError(data.error ?? "Failed to accept invitation.");
      setAccepting(false);
      return;
    }
    // Refresh JWT with new org context
    await update({
      organizationId: data.organizationId,
      orgRole:        data.orgRole,
      isBillingOwner: data.isBillingOwner,
      membershipCount: data.membershipCount,
    });
    setAccepted(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <h1 className="text-h2 text-gray-900 mb-2">Invitation unavailable</h1>
          <p className="text-body text-gray-500">{fetchError}</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-body text-gray-500">Loading invitation…</p>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <h1 className="text-h2 text-gray-900 mb-2">Welcome to {details.orgName}!</h1>
          <p className="text-body text-gray-500">Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  const roleLabel = details.role.charAt(0) + details.role.slice(1).toLowerCase();
  const isInvitee = status === "authenticated" && session?.user?.email?.toLowerCase() === details.email.toLowerCase();

  // The invitation was already applied. For the invitee this is just a
  // stale link — refresh the session with that org and send them on. For
  // anyone else it's simply unavailable.
  if (details.accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          {isInvitee ? (
            <>
              <h1 className="text-h2 text-gray-900 mb-2">You&rsquo;re already a member of {details.orgName}</h1>
              <p className="text-body text-gray-500 mb-6">This invitation has been accepted — nothing more to do here.</p>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-[#1a1a2e] text-white text-body font-semibold py-3 rounded-lg
                           hover:bg-[#2a2a4e] disabled:opacity-60 transition"
              >
                {accepting ? "Opening…" : "Go to dashboard"}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-h2 text-gray-900 mb-2">Invitation unavailable</h1>
              <p className="text-body text-gray-500">This invitation has already been accepted.</p>
              {status === "unauthenticated" && (
                <a
                  href={`/login?callbackUrl=/invite/${token}`}
                  className="inline-block mt-6 text-body font-semibold text-[#1a1a2e] hover:underline"
                >
                  Log in
                </a>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow p-8 max-w-md w-full">
        <h1 className="text-h2 text-gray-900 mb-1">
          You&rsquo;ve been invited to join {details.orgName}
        </h1>
        <p className="text-body text-gray-500 mb-6">
          {details.inviterName} invited you as <strong>{roleLabel}</strong>.
        </p>

        {status === "loading" && (
          <p className="text-body text-gray-400">Checking your session…</p>
        )}

        {status === "authenticated" && session?.user?.email?.toLowerCase() === details.email.toLowerCase() && (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-[#1a1a2e] text-white text-body font-semibold py-3 rounded-lg
                       hover:bg-[#2a2a4e] disabled:opacity-60 transition"
          >
            {accepting ? "Accepting…" : `Accept invitation to ${details.orgName}`}
          </button>
        )}

        {status === "authenticated" && session?.user?.email?.toLowerCase() !== details.email.toLowerCase() && (
          <div className="text-body text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            You&rsquo;re logged in as <strong>{session.user.email}</strong>, but this invitation was sent to{" "}
            <strong>{details.email}</strong>. Please log in with the correct account to accept.
          </div>
        )}

        {status === "unauthenticated" && (
          <div className="space-y-3">
            <a
              href={`/login?callbackUrl=/invite/${token}`}
              className="block w-full text-center bg-[#1a1a2e] text-white text-body font-semibold
                         py-3 rounded-lg hover:bg-[#2a2a4e] transition"
            >
              Log in to accept
            </a>
            <a
              href={`/signup?invite=${token}`}
              className="block w-full text-center border border-gray-300 text-gray-700
                         text-body font-semibold py-3 rounded-lg hover:bg-gray-50 transition"
            >
              Create an account
            </a>
          </div>
        )}

        <p className="text-caption text-gray-400 mt-6">
          This invitation expires on {new Date(details.expiresAt).toLocaleString()}.
        </p>
      </div>
    </div>
  );
}
