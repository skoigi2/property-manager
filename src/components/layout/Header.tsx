"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { LogOut, User, ChevronDown, Building2, HelpCircle, ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useProperty } from "@/lib/property-context";
import toast from "react-hot-toast";

// Context-aware help: map the current route to the matching guide.html section
// so the ? icon opens the guide at the page you're on, not at the top.
// Longest-prefix match; anchors are the guide's stable section ids.
const GUIDE_ANCHORS: [prefix: string, anchor: string][] = [
  ["/inbox",              "inbox"],
  ["/dashboard",          "dashboard"],
  ["/calendar",           "calendar"],
  ["/cases",              "cases"],
  ["/approve",            "cases"],
  ["/properties",         "properties"],
  ["/tenants",            "tenants"],
  ["/income",             "income"],
  ["/invoices",           "income"],
  ["/arrears",            "income"],
  ["/expenses",           "expenses"],
  ["/petty-cash",         "expenses"],
  ["/recurring-expenses", "expenses"],
  ["/maintenance",        "maintenance"],
  ["/report",             "reports"],
  ["/forecast",           "operations"],
  ["/vendors",            "operations"],
  ["/insurance",          "operations"],
  ["/compliance",         "operations"],
  ["/assets",             "operations"],
  ["/airbnb",             "income"],
  ["/import",             "import"],
  ["/settings",           "settings"],
  ["/billing",            "billing"],
  ["/upgrade",            "billing"],
  ["/automations",        "automations"],
];

function guideHrefFor(pathname: string | null): string {
  if (!pathname) return "/guide.html";
  const hit = GUIDE_ANCHORS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
  return hit ? `/guide.html#${hit[1]}` : "/guide.html";
}

interface HeaderProps {
  title: string;
  userName?: string | null;
  role?: string;
  children?: React.ReactNode;
}

interface OrgOption { id: string; name: string }

export function Header({ title, userName, role, children }: HeaderProps) {
  const { data: session, update } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const { properties, selectedId, setSelectedId, selected, loading, currency, mixedCurrencies } = useProperty();

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

  // ── Super-admin: organisation viewing scope ─────────────────────────────────
  // Properties span every org for super-admin — a flat list is unusable. The
  // org dropdown sets a cookie that the server reads in
  // getAccessiblePropertyIds, so EVERY page renders scoped to that org (not
  // just the property dropdown). Changing it reloads to refetch all data.
  const SUPER_ORG_COOKIE = "gw-super-org-filter";
  const [orgFilter, setOrgFilterState] = useState<string | null>(null); // null = all orgs
  const [orgFilterOpen, setOrgFilterOpen] = useState(false);
  const [superOrgs, setSuperOrgs] = useState<OrgOption[]>([]);
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${SUPER_ORG_COOKIE}=([^;]*)`));
    if (m) setOrgFilterState(decodeURIComponent(m[1]));
  }, []);
  useEffect(() => {
    // Full org list for the filter dropdown — the property list can't supply
    // it once the server has narrowed it to one org.
    if (!isSuperAdmin) return;
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSuperOrgs(
            data
              .map((o: { id: string; name: string }) => ({ id: o.id, name: o.name }))
              .sort((a: OrgOption, b: OrgOption) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {});
  }, [isSuperAdmin]);
  const setOrgFilter = (id: string | null) => {
    setOrgFilterState(id);
    if (id) {
      document.cookie = `${SUPER_ORG_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax; max-age=31536000`;
    } else {
      document.cookie = `${SUPER_ORG_COOKIE}=; path=/; SameSite=Lax; max-age=0`;
    }
    // Scope changed — every page's data changes with it
    window.location.reload();
  };

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
        <h1 className=" text-white text-h3 shrink-0">{title}</h1>

        {/* Super-admin: organisation viewing scope — scopes ALL pages */}
        {(() => {
          const showOrgFilter = isSuperAdmin && superOrgs.length > 0;
          if (!showOrgFilter) return null;
          const activeOrgFilterName = superOrgs.find((o) => o.id === orgFilter)?.name ?? null;
          return (
            <div className="relative">
              <button
                onClick={() => { setOrgFilterOpen(!orgFilterOpen); setPropOpen(false); setMenuOpen(false); }}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-2.5 py-1 rounded-lg text-body transition-colors"
                title="View the platform as one organisation — scopes every page"
              >
                <Building2 size={13} className="text-gold shrink-0" />
                <span className="truncate max-w-[90px] sm:max-w-[140px]">
                  {activeOrgFilterName ?? "All orgs"}
                </span>
                <ChevronDown size={13} />
              </button>
              {orgFilterOpen && (
                <div className="absolute left-0 top-full mt-2 w-56 max-h-80 overflow-y-auto bg-white rounded-xl shadow-card-hover border border-gray-100 z-50">
                  <button
                    onClick={() => { setOrgFilterOpen(false); setOrgFilter(null); }}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-body transition-colors ${orgFilter === null ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    All organisations
                  </button>
                  {superOrgs.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => { setOrgFilterOpen(false); setOrgFilter(o.id); }}
                      className={`flex items-center gap-2 w-full px-4 py-2.5 text-body transition-colors ${orgFilter === o.id ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <span className="truncate">{o.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Property selector */}
        {showSelector && (() => {
          // Across all orgs the org name is the useful per-row context; within
          // a single org (or for org users) the billing type is.
          const orgSpan = new Set(properties.map((p) => p.organizationId ?? "__none__")).size;
          const showOrgContext = isSuperAdmin && orgSpan > 1;
          const selectorProperties = properties;
          return (
          <div className="relative">
            <button
              onClick={() => { setPropOpen(!propOpen); setOrgFilterOpen(false); setMenuOpen(false); }}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-2.5 py-1 rounded-lg text-body transition-colors"
            >
              <Building2 size={13} className="text-gold shrink-0" />
              <span className="truncate max-w-[90px] sm:max-w-[140px]">
                {selected?.name ?? "All properties"}
              </span>
              <ChevronDown size={13} />
            </button>

            {propOpen && (
              <div className="absolute left-0 top-full mt-2 w-60 max-h-96 overflow-y-auto bg-white rounded-xl shadow-card-hover border border-gray-100 z-50">
                <button
                  onClick={() => { setSelectedId(null); setPropOpen(false); }}
                  className={`flex items-center gap-2 w-full px-4 py-2.5 text-body transition-colors ${selectedId === null ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  All properties
                </button>
                {selectorProperties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setPropOpen(false); }}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-body transition-colors ${selectedId === p.id ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-caption text-gray-400 shrink-0 truncate max-w-[90px]">
                      {showOrgContext ? (p.orgName ?? "—") : (p.type === "AIRBNB" ? "Airbnb" : "Long-term")}
                    </span>
                  </button>
                ))}
                {selectorProperties.length === 0 && (
                  <p className="px-4 py-2.5 text-caption text-gray-400 italic">No properties in this organisation.</p>
                )}
              </div>
            )}
          </div>
          );
        })()}

        {/* Mixed-currency caveat — portfolio totals are a cross-currency sum */}
        {mixedCurrencies && (
          <span
            title={`Your properties use different currencies. "All properties" totals add the raw amounts together and display them as ${currency} — select a single property for exact figures.`}
            className="hidden sm:flex items-center gap-1 bg-amber-400/20 text-amber-200 px-2 py-1 rounded-lg text-caption shrink-0 cursor-help"
          >
            ⚠ Mixed currencies
          </span>
        )}

        {/* Single property badge when only one */}
        {!loading && properties.length === 1 && (
          <span className="flex items-center gap-1.5 bg-white/10 text-white/60 px-2.5 py-1 rounded-lg text-body truncate max-w-[120px] sm:max-w-none">
            <Building2 size={13} className="text-gold shrink-0" />
            {properties[0].name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {children}
        <a
          href={guideHrefFor(pathname)}
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
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-body "
          >
            <div className="w-7 h-7 rounded-full bg-gold/30 flex items-center justify-center">
              <User size={14} className="text-gold" />
            </div>
            <span className="hidden sm:block">{effectiveName}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-card-hover border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-body font-medium text-header ">{effectiveName}</p>
                {effectiveRole && <p className="text-caption text-gray-400 ">{effectiveRole}</p>}
                {showOrgSwitcher && activeOrgName && (
                  <p className="text-caption text-gray-500 mt-1 flex items-center gap-1">
                    <Building2 size={11} className="text-gold" /> {activeOrgName}
                  </p>
                )}
              </div>

              {/* Organisation switcher — visible on mobile where the Sidebar is hidden */}
              {showOrgSwitcher && (
                <div className="border-b border-gray-50">
                  <p className="px-4 pt-3 pb-1 text-label uppercase text-gray-400 flex items-center gap-1">
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
                        className={`flex items-center gap-2 w-full px-4 py-2 text-body transition-colors ${
                          isActive ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"
                        } disabled:opacity-60`}
                      >
                        {busy ? (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <Building2 size={13} className={isActive ? "text-gold" : "text-gray-400"} />
                        )}
                        <span className="truncate">{org.name}</span>
                        {isActive && <span className="ml-auto text-caption text-gold">Active</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-body text-expense hover:bg-red-50 transition-colors"
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
