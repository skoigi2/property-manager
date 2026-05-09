"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut, User, ChevronDown, Building2, HelpCircle, ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useProperty } from "@/lib/property-context";
import toast from "react-hot-toast";

interface HeaderProps {
  title: string;
  userName?: string | null;
  role?: string;
  children?: React.ReactNode;
}

interface OrgOption { id: string; name: string }

export function Header({ title, userName, role, children }: HeaderProps) {
  const { data: session, update } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const { properties, selectedId, setSelectedId, selected, loading } = useProperty();

  const showSelector = !loading && properties.length > 1;

  // ── Org switcher (mirrors Sidebar — works on mobile where Sidebar is hidden) ──
  const sessionUser = session?.user as { organizationId?: string | null; role?: string; membershipCount?: number; name?: string | null } | undefined;
  const effectiveRole = role ?? sessionUser?.role;
  const effectiveName = userName ?? sessionUser?.name ?? "User";
  const organizationId = sessionUser?.organizationId ?? null;
  const isSuperAdmin = effectiveRole === "ADMIN" && organizationId === null;
  const membershipCount = sessionUser?.membershipCount ?? 1;

  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin && membershipCount > 1) {
      fetch("/api/auth/orgs").then((r) => r.json()).then(setOrgOptions).catch(() => {});
    }
  }, [organizationId, isSuperAdmin, membershipCount]);

  const showOrgSwitcher = !isSuperAdmin && membershipCount > 1 && orgOptions.length > 0;
  const activeOrgName = orgOptions.find((o) => o.id === organizationId)?.name;

  async function switchOrg(orgId: string) {
    if (orgId === organizationId) { setMenuOpen(false); return; }
    setSwitching(orgId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error();
      await update({ organizationId: orgId });
      setMenuOpen(false);
      window.location.reload();
    } catch {
      toast.error("Failed to switch organisation");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <header className="bg-header sticky top-0 z-30 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-white text-lg shrink-0">{title}</h1>

        {/* Property selector */}
        {showSelector && (
          <div className="relative">
            <button
              onClick={() => { setPropOpen(!propOpen); setMenuOpen(false); }}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-2.5 py-1 rounded-lg text-sm font-sans transition-colors"
            >
              <Building2 size={13} className="text-gold shrink-0" />
              <span className="truncate max-w-[90px] sm:max-w-[140px]">
                {selected?.name ?? "All properties"}
              </span>
              <ChevronDown size={13} />
            </button>

            {propOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 bg-white rounded-xl shadow-card-hover border border-gray-100 overflow-hidden z-50">
                <button
                  onClick={() => { setSelectedId(null); setPropOpen(false); }}
                  className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm font-sans transition-colors ${selectedId === null ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  All properties
                </button>
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setPropOpen(false); }}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm font-sans transition-colors ${selectedId === p.id ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">
                      {p.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Single property badge when only one */}
        {!loading && properties.length === 1 && (
          <span className="flex items-center gap-1.5 bg-white/10 text-white/60 px-2.5 py-1 rounded-lg text-sm font-sans truncate max-w-[120px] sm:max-w-none">
            <Building2 size={13} className="text-gold shrink-0" />
            {properties[0].name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {children}
        <a
          href="/guide.html"
          target="_blank"
          rel="noopener noreferrer"
          title="Help & User Guide"
          className="text-white/50 hover:text-white transition-colors"
        >
          <HelpCircle size={18} />
        </a>
        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setMenuOpen(!menuOpen); setPropOpen(false); }}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-sans"
          >
            <div className="w-7 h-7 rounded-full bg-gold/30 flex items-center justify-center">
              <User size={14} className="text-gold" />
            </div>
            <span className="hidden sm:block">{effectiveName}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-card-hover border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-medium text-header font-sans">{effectiveName}</p>
                {effectiveRole && <p className="text-xs text-gray-400 font-sans">{effectiveRole}</p>}
                {showOrgSwitcher && activeOrgName && (
                  <p className="text-xs text-gray-500 font-sans mt-1 flex items-center gap-1">
                    <Building2 size={11} className="text-gold" /> {activeOrgName}
                  </p>
                )}
              </div>

              {/* Organisation switcher — visible on mobile where the Sidebar is hidden */}
              {showOrgSwitcher && (
                <div className="border-b border-gray-50">
                  <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-sans flex items-center gap-1">
                    <ArrowLeftRight size={10} /> Switch organisation
                  </p>
                  {orgOptions.map((org) => {
                    const isActive = org.id === organizationId;
                    const busy = switching === org.id;
                    return (
                      <button
                        key={org.id}
                        onClick={() => switchOrg(org.id)}
                        disabled={busy || isActive}
                        className={`flex items-center gap-2 w-full px-4 py-2 text-sm font-sans transition-colors ${
                          isActive ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"
                        } disabled:opacity-60`}
                      >
                        {busy ? (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <Building2 size={13} className={isActive ? "text-gold" : "text-gray-400"} />
                        )}
                        <span className="truncate">{org.name}</span>
                        {isActive && <span className="ml-auto text-[10px] text-gold">Active</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-expense hover:bg-red-50 font-sans transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
