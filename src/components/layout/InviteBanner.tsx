"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail, X } from "lucide-react";

interface PendingInvite {
  id: string;
  token: string;
  role: string;
  organization: { name: string };
  invitedBy: { name: string | null; email: string | null };
}

export function InviteBanner() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/invitations/my")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInvites)
      .catch(() => {});
  }, [session?.user?.email]);

  const visible = invites.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  async function accept(invite: PendingInvite) {
    setAccepting(invite.id);
    try {
      const res = await fetch(`/api/invitations/${invite.token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to accept");

      await update({
        organizationId: data.organizationId,
        orgRole:        data.orgRole,
        isBillingOwner: data.isBillingOwner,
        membershipCount: data.membershipCount,
      });

      toast.success(`Joined ${invite.organization.name}`);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setAccepting(null);
    }
  }

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-px">
      {visible.map((invite) => {
        const inviterName = invite.invitedBy.name ?? invite.invitedBy.email ?? "Someone";
        return (
          <div
            key={invite.id}
            className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-sans"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Mail size={15} className="shrink-0 opacity-80" />
              <span className="truncate">
                <span className="font-medium">{inviterName}</span> invited you to join{" "}
                <span className="font-medium">{invite.organization.name}</span> as {invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => accept(invite)}
                disabled={accepting === invite.id}
                className="bg-white text-blue-600 font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-blue-50 transition-colors disabled:opacity-60"
              >
                {accepting === invite.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    Joining…
                  </span>
                ) : "Accept"}
              </button>
              <button
                onClick={() => dismiss(invite.id)}
                className="text-white/60 hover:text-white transition-colors"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
