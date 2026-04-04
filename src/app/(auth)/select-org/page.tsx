"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Building2, Home, ChevronRight } from "lucide-react";

interface OrgOption {
  id: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
}

export default function SelectOrgPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/orgs")
      .then((r) => r.json())
      .then((data) => { setOrgs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function selectOrg(orgId: string) {
    setSelecting(orgId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error("Failed to switch");
      // Refresh the JWT with the new organizationId
      await update({ organizationId: orgId });
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Failed to select organisation");
      setSelecting(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-[#1a2332] rounded-xl flex items-center justify-center">
            <Home size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="font-display text-[#1a2332] text-base leading-none">Property Manager</p>
            <p className="text-gray-400 text-xs font-sans mt-0.5">Property Manager</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="mb-6">
            <h1 className="font-display text-xl text-[#1a2332]">Select Organisation</h1>
            <p className="text-sm text-gray-500 font-sans mt-1">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}. You have access to multiple organisations — choose one to continue.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-gray-400 font-sans text-center py-6">No organisations found.</p>
          ) : (
            <div className="space-y-2">
              {orgs.map((org) => {
                const busy = selecting === org.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org.id)}
                    disabled={!!selecting || !org.isActive}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {/* Logo or placeholder */}
                    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <Building2 size={16} className="text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-sm font-medium text-[#1a2332] truncate">{org.name}</p>
                      {!org.isActive && (
                        <p className="text-xs text-red-400 font-sans">Inactive</p>
                      )}
                    </div>
                    {busy ? (
                      <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-amber-400 transition-colors shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
