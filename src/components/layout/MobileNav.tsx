"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  LayoutDashboard, TrendingUp, Receipt, FileText,
  Users, Wallet, ScrollText, Wrench, AlertTriangle,
  ShieldPlus, Package, RepeatIcon, Upload, Settings,
  UserCog, ShieldCheck, Building2, MoreHorizontal, X,
  BarChart3, CalendarDays, CalendarRange, BookOpen, Inbox, Briefcase,
  ArrowLeftRight, Mail, Sparkles, Zap, Bell, CreditCard,
  PlayCircle,
  MessageSquareWarning,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface DrawerSection {
  heading: string;
  items: NavItem[];
}

// Bottom bar primary items per role
const mgrPrimary: NavItem[] = [
  { href: "/inbox",      label: "Inbox",      icon: Inbox },
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/tenants",    label: "Tenants",    icon: Users },
  { href: "/income",     label: "Income",     icon: TrendingUp },
];

const accountantPrimary: NavItem[] = [
  { href: "/inbox",      label: "Inbox",      icon: Inbox },
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/tenants",    label: "Tenants",    icon: Users },
  { href: "/income",     label: "Income",     icon: TrendingUp },
];

const ownerItems: NavItem[] = [
  { href: "/report", label: "Report", icon: FileText },
];

// On-site CARETAKER: expenses, maintenance, vendors — nothing else.
const caretakerPrimary: NavItem[] = [
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/complaints",  label: "Complaints",  icon: MessageSquareWarning },
  { href: "/expenses",    label: "Expenses",    icon: Receipt },
  { href: "/vendors",     label: "Vendors",     icon: Building2 },
];
const caretakerDrawerSections: DrawerSection[] = [
  {
    heading: "Help",
    items: [
      { href: "/help/tutorials", label: "Tutorials", icon: PlayCircle },
    ],
  },
];

// Grouped drawer sections per role
const mgrDrawerSections: DrawerSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/calendar",   label: "Calendar",   icon: CalendarRange },
      { href: "/airbnb",     label: "Airbnb",     icon: CalendarDays },
      { href: "/report",     label: "Report",     icon: FileText },
    ],
  },
  {
    heading: "Finances",
    items: [
      { href: "/expenses",           label: "Expenses",   icon: Receipt },
      { href: "/petty-cash",         label: "Petty Cash", icon: Wallet },
      { href: "/recurring-expenses", label: "Recurring",  icon: RepeatIcon },
    ],
  },
  {
    heading: "Tenants",
    items: [
      { href: "/invoices", label: "Invoices", icon: ScrollText },
      { href: "/arrears",  label: "Arrears",  icon: AlertTriangle },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/cases",       label: "Cases",       icon: Briefcase },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/complaints",  label: "Complaints",  icon: MessageSquareWarning },
      { href: "/assets",      label: "Assets",      icon: Package },
      { href: "/vendors",     label: "Vendors",     icon: Building2 },
      { href: "/insurance",   label: "Insurance",   icon: ShieldPlus },
      { href: "/compliance",  label: "Compliance",  icon: BarChart3 },
    ],
  },
  {
    heading: "Settings",
    items: [
      { href: "/settings",              label: "Settings",      icon: Settings },
      { href: "/automations",           label: "Automations",   icon: Zap },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
      { href: "/settings/calendar",     label: "Calendar Feed", icon: CalendarRange },
      { href: "/settings/payment-accounts", label: "Payment Accounts", icon: CreditCard },
      { href: "/settings/users",        label: "Users",         icon: UserCog },
      { href: "/settings/audit", label: "Audit Log",   icon: ShieldCheck },
      { href: "/import",         label: "Import",      icon: Upload },
    ],
  },
];

const accountantDrawerSections: DrawerSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/calendar",   label: "Calendar",   icon: CalendarRange },
      { href: "/airbnb",     label: "Airbnb",     icon: CalendarDays },
      { href: "/report",     label: "Report",     icon: FileText },
    ],
  },
  {
    heading: "Finances",
    items: [
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    heading: "Tenants",
    items: [
      { href: "/invoices", label: "Invoices", icon: ScrollText },
      { href: "/arrears",  label: "Arrears",  icon: AlertTriangle },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/cases",       label: "Cases",       icon: Briefcase },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/complaints",  label: "Complaints",  icon: MessageSquareWarning },
      { href: "/vendors",     label: "Vendors",     icon: Building2 },
      { href: "/compliance",  label: "Compliance",  icon: BarChart3 },
    ],
  },
];

// Super-admin only links (mirrors the Sidebar's Organisations / Emails / Hints)
const superAdminItems: NavItem[] = [
  { href: "/admin/organizations", label: "Organisations", icon: Building2 },
  { href: "/admin/emails",        label: "Emails",        icon: Mail },
  { href: "/admin/hints",         label: "Hints",         icon: Sparkles },
];

interface MobileNavProps {
  role?: string;
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Org switcher (mobile home for multi-org users; Sidebar is hidden < lg) ──
  const { data: session, update } = useSession();
  const sessionUser = session?.user as { organizationId?: string | null; role?: string; membershipCount?: number } | undefined;
  const organizationId = sessionUser?.organizationId ?? null;
  const isSuperAdmin = (role ?? sessionUser?.role) === "ADMIN" && organizationId === null;
  const membershipCount = sessionUser?.membershipCount ?? 1;
  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string }[]>([]);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin && membershipCount > 1) {
      fetch("/api/auth/orgs").then((r) => r.json()).then(setOrgOptions).catch(() => {});
    }
  }, [organizationId, isSuperAdmin, membershipCount]);

  const showOrgSwitcher = !isSuperAdmin && membershipCount > 1 && orgOptions.length > 0;

  async function switchOrg(orgId: string) {
    if (orgId === organizationId) { setDrawerOpen(false); return; }
    setSwitchingOrg(orgId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error();
      await update({ organizationId: orgId });
      setDrawerOpen(false);
      window.location.reload();
    } catch {
      toast.error("Failed to switch organisation");
    } finally {
      setSwitchingOrg(null);
    }
  }

  if (role === "OWNER") {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-header border-t border-white/10 z-40 safe-b overflow-hidden">
        <div className="flex w-full">
          {ownerItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-caption transition-colors",
                  pathname === item.href ? "text-gold" : "text-white/50 hover:text-white/80"
                )}
              >
                <Icon size={20} />
                <span className="truncate w-full text-center leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // Allow-list lookup per role. An unknown role gets the smallest set — a
  // new enum value must be added here deliberately, never fall through to
  // the manager nav.
  const NAV_BY_ROLE: Record<string, { primary: NavItem[]; drawer: DrawerSection[] }> = {
    ADMIN:      { primary: mgrPrimary,        drawer: mgrDrawerSections },
    MANAGER:    { primary: mgrPrimary,        drawer: mgrDrawerSections },
    ACCOUNTANT: { primary: accountantPrimary, drawer: accountantDrawerSections },
    CARETAKER:  { primary: caretakerPrimary,  drawer: caretakerDrawerSections },
  };
  const nav = NAV_BY_ROLE[role ?? ""] ?? NAV_BY_ROLE.CARETAKER;
  const primaryItems = nav.primary;
  const drawerSections = nav.drawer;

  // Check if current path is in drawer (not in primary bar)
  const drawerIsActive = drawerSections
    .flatMap((s) => s.items)
    .some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-header border-t border-white/10 z-40 safe-b overflow-hidden">
        <div className="flex w-full">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-caption transition-colors",
                  isActive ? "text-gold" : "text-white/50 hover:text-white/80"
                )}
              >
                <Icon size={20} />
                <span className="truncate w-full text-center leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={clsx(
              "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-caption transition-colors",
              drawerOpen || drawerIsActive ? "text-gold" : "text-white/50 hover:text-white/80"
            )}
          >
            <MoreHorizontal size={20} />
            <span className="truncate w-full text-center leading-none">More</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-header rounded-t-2xl z-50 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-header">
              <p className="text-white font-medium text-body">More</p>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-5">
              {/* Admin — super-admin only (Sidebar is hidden on mobile) */}
              {isSuperAdmin && (
                <div>
                  <p className="text-white/30 text-label uppercase mb-2 px-1">
                    Admin
                  </p>
                  <div className="grid grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden">
                    {superAdminItems.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setDrawerOpen(false)}
                          className={clsx(
                            "flex flex-col items-center gap-2 py-4 bg-header transition-colors",
                            isActive ? "text-gold" : "text-white/60 hover:text-white"
                          )}
                        >
                          <Icon size={20} />
                          <span className="text-caption text-center ">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {drawerSections.map((section) => (
                <div key={section.heading}>
                  <p className="text-white/30 text-label uppercase mb-2 px-1">
                    {section.heading}
                  </p>
                  <div className="grid grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setDrawerOpen(false)}
                          className={clsx(
                            "flex flex-col items-center gap-2 py-4 bg-header transition-colors",
                            isActive ? "text-gold" : "text-white/60 hover:text-white"
                          )}
                        >
                          <Icon size={20} />
                          <span className="text-caption text-center ">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Organisation switcher — multi-org users (Sidebar is hidden on mobile) */}
              {showOrgSwitcher && (
                <div>
                  <p className="text-white/30 text-label uppercase mb-2 px-1 flex items-center gap-1.5">
                    <ArrowLeftRight size={11} /> Organisation
                  </p>
                  <div className="bg-white/5 rounded-xl overflow-hidden">
                    {orgOptions.map((org) => {
                      const isActive = org.id === organizationId;
                      const busy = switchingOrg === org.id;
                      return (
                        <button
                          key={org.id}
                          onClick={() => switchOrg(org.id)}
                          disabled={busy || isActive}
                          className={clsx(
                            "flex items-center gap-2.5 w-full px-4 py-3 text-left text-body transition-colors disabled:cursor-default",
                            isActive ? "text-gold" : "text-white/70 hover:text-white hover:bg-white/5",
                          )}
                        >
                          {busy ? (
                            <span className="w-4 h-4 rounded-full border-2 border-gold border-t-transparent animate-spin shrink-0" />
                          ) : (
                            <Building2 size={16} className={isActive ? "text-gold shrink-0" : "text-white/40 shrink-0"} />
                          )}
                          <span className="truncate flex-1">{org.name}</span>
                          {isActive && <span className="text-caption text-gold shrink-0">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Help & Guide */}
              <div className="border-t border-white/10 pt-4">
                <a
                  href="/guide.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors text-body w-full"
                >
                  <BookOpen size={18} />
                  Help &amp; Guide
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
