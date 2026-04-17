"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Wallet,
  Users,
  FileText,
  Settings,
  LogOut,

  Building2,
  UserCog,
  Wrench,
  ScrollText,
  AlertTriangle,
  RepeatIcon,
  ShieldCheck,
  Upload,
  ShieldPlus,
  Package,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  LineChart,
  CreditCard,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/BrandLogo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  roles: string[];
  items: NavItem[];
}

type SidebarEntry = NavItem | ({ type: "group" } & NavGroup);

const sidebarEntries: SidebarEntry[] = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/properties", label: "Properties", icon: Building2,        roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/airbnb",    label: "Airbnb",    icon: CalendarDays, roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/calendar",  label: "Calendar",  icon: CalendarRange, roles: ["MANAGER", "ACCOUNTANT"] },
  {
    type: "group",
    label: "Finances",
    icon: TrendingUp,
    roles: ["MANAGER", "ACCOUNTANT"],
    items: [
      { href: "/income",             label: "Income",    icon: TrendingUp,  roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/expenses",           label: "Expenses",  icon: Receipt,     roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/petty-cash",         label: "Petty Cash",icon: Wallet,      roles: ["MANAGER"] },
      { href: "/recurring-expenses", label: "Recurring", icon: RepeatIcon,  roles: ["MANAGER"] },
      { href: "/forecast",           label: "Forecast",  icon: LineChart,   roles: ["MANAGER", "ACCOUNTANT"] },
    ],
  },
  {
    type: "group",
    label: "Tenants",
    icon: Users,
    roles: ["MANAGER", "ACCOUNTANT"],
    items: [
      { href: "/tenants",  label: "Directory", icon: Users,         roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/invoices", label: "Invoices",  icon: ScrollText,    roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/arrears",  label: "Arrears",   icon: AlertTriangle, roles: ["MANAGER", "ACCOUNTANT"] },
    ],
  },
  {
    type: "group",
    label: "Operations",
    icon: Wrench,
    roles: ["MANAGER", "ACCOUNTANT"],
    items: [
      { href: "/maintenance", label: "Maintenance", icon: Wrench,    roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/assets",      label: "Assets",      icon: Package,   roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/vendors",     label: "Vendors",     icon: Building2, roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/insurance",   label: "Insurance",   icon: ShieldPlus,roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/compliance",              label: "Compliance",  icon: BarChart3,  roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/compliance/certificates", label: "Certificates", icon: ShieldCheck, roles: ["MANAGER", "ACCOUNTANT"] },
    ],
  },
  { href: "/report", label: "Report", icon: FileText, roles: ["MANAGER", "ACCOUNTANT", "OWNER"] },
  {
    type: "group",
    label: "Settings",
    icon: Settings,
    roles: ["MANAGER"],
    items: [
      { href: "/settings",       label: "General",   icon: Settings,   roles: ["MANAGER"] },
      { href: "/settings/users", label: "Users",     icon: UserCog,    roles: ["MANAGER"] },
      { href: "/settings/audit", label: "Audit Log", icon: ShieldCheck,roles: ["MANAGER"] },
      { href: "/import",         label: "Import",    icon: Upload,     roles: ["MANAGER"] },
      { href: "/billing",        label: "Billing",   icon: CreditCard, roles: ["MANAGER"] },
    ],
  },
];

function isGroup(entry: SidebarEntry): entry is { type: "group" } & NavGroup {
  return "type" in entry && entry.type === "group";
}

function groupContainsPath(group: NavGroup, pathname: string): boolean {
  return group.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );
}

interface OrgOption { id: string; name: string; logoUrl: string | null; }

interface SidebarProps {
  role?: string;
  organizationId?: string | null;
}

export function Sidebar({ role, organizationId }: SidebarProps) {
  const isSuperAdmin = role === "ADMIN" && organizationId === null;
  const pathname = usePathname();
  const { data: session, update } = useSession();
  const router = useRouter();
  const membershipCount = (session?.user as any)?.membershipCount ?? 1;

  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (membershipCount > 1 && !isSuperAdmin) {
      fetch("/api/auth/orgs").then((r) => r.json()).then(setOrgOptions).catch(() => {});
    }
  }, [membershipCount, isSuperAdmin]);

  async function switchOrg(orgId: string) {
    if (orgId === organizationId) { setOrgSwitcherOpen(false); return; }
    setSwitching(orgId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error();
      await update({ organizationId: orgId });
      setOrgSwitcherOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to switch organisation");
    } finally { setSwitching(null); }
  }

  // Determine which groups should start open (those containing the active route)
  const defaultOpen = sidebarEntries
    .filter(isGroup)
    .filter((g) => groupContainsPath(g, pathname))
    .map((g) => g.label);

  const [openGroups, setOpenGroups] = useState<string[]>(defaultOpen);

  // Auto-expand group when navigating to a sub-item
  useEffect(() => {
    sidebarEntries.filter(isGroup).forEach((g) => {
      if (groupContainsPath(g, pathname)) {
        setOpenGroups((prev) => (prev.includes(g.label) ? prev : [...prev, g.label]));
      }
    });
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  function canSee(roles: string[]) {
    return !role || role === "ADMIN" || roles.includes(role);
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-header min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <BrandLogo size={32} dark />
          <div className="flex-1 min-w-0">
            <p className="font-display text-white text-sm leading-none">Groundwork PM</p>
            <p className="text-white/40 text-xs font-sans mt-0.5">Groundwork PM</p>
          </div>
        </div>

        {/* Org switcher — only for multi-org non-super-admin users */}
        {!isSuperAdmin && membershipCount > 1 && orgOptions.length > 0 && (
          <div className="mt-3 relative">
            <button
              onClick={() => setOrgSwitcherOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
            >
              <Building2 size={13} className="text-white/40 shrink-0" />
              <span className="text-xs font-sans text-white/60 flex-1 truncate">
                {orgOptions.find((o) => o.id === organizationId)?.name ?? "Select org"}
              </span>
              <ArrowLeftRight size={11} className="text-white/30 shrink-0" />
            </button>

            {orgSwitcherOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                {orgOptions.map((org) => {
                  const isActive = org.id === organizationId;
                  const busy = switching === org.id;
                  return (
                    <button
                      key={org.id}
                      onClick={() => switchOrg(org.id)}
                      disabled={busy || isActive}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-sans transition-colors ${
                        isActive ? "bg-gold/10 text-gold font-medium" : "text-gray-700 hover:bg-gray-50"
                      } disabled:opacity-60`}
                    >
                      {busy ? (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <Building2 size={13} className={isActive ? "text-gold" : "text-gray-400"} />
                      )}
                      <span className="truncate">{org.name}</span>
                      {isActive && <span className="ml-auto text-xs text-gold">Active</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Super-admin: Organisations link */}
        {isSuperAdmin && (() => {
          const isActive = pathname === "/admin/organizations" || pathname.startsWith("/admin/organizations/");
          return (
            <Link
              href="/admin/organizations"
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-colors mb-1",
                isActive ? "bg-gold text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <Building2 size={18} />
              Organisations
            </Link>
          );
        })()}
        {sidebarEntries.map((entry) => {
          if (isGroup(entry)) {
            if (!canSee(entry.roles)) return null;

            const visibleItems = entry.items.filter((i) => canSee(i.roles));
            if (visibleItems.length === 0) return null;

            const isOpen = openGroups.includes(entry.label);
            const isGroupActive = groupContainsPath(entry, pathname);
            const Icon = entry.icon;

            return (
              <div key={entry.label}>
                <button
                  onClick={() => toggleGroup(entry.label)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-colors w-full",
                    isGroupActive && !isOpen
                      ? "bg-gold/20 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
                    {visibleItems.map((item) => {
                      const SubIcon = item.icon;
                      // A sibling with a longer href may be a more precise match —
                      // e.g. /settings/users is more precise than /settings for the
                      // path /settings/users, so General (/settings) should not highlight.
                      const siblingIsMorePrecise = visibleItems.some(
                        (s) => s.href !== item.href &&
                          (pathname === s.href || pathname.startsWith(s.href + "/"))
                      );
                      const isActive =
                        !siblingIsMorePrecise &&
                        (pathname === item.href || pathname.startsWith(item.href + "/"));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={clsx(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-sans transition-colors",
                            isActive
                              ? "bg-gold text-white"
                              : "text-white/50 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <SubIcon size={15} className="shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Plain nav item
          if (!canSee(entry.roles)) return null;
          const Icon = entry.icon;
          const isActive =
            pathname === entry.href || pathname.startsWith(entry.href + "/");
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-colors",
                isActive
                  ? "bg-gold text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans text-white/60 hover:bg-white/10 hover:text-white w-full transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
