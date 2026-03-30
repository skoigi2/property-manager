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
  Home,
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";

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
  { href: "/airbnb",     label: "Airbnb",     icon: CalendarDays,     roles: ["MANAGER", "ACCOUNTANT"] },
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
      { href: "/insurance",   label: "Insurance",   icon: ShieldPlus,roles: ["MANAGER", "ACCOUNTANT"] },
      { href: "/compliance",  label: "Compliance",  icon: BarChart3, roles: ["MANAGER", "ACCOUNTANT"] },
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

interface SidebarProps {
  role?: string;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

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
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center shrink-0">
          <Home size={16} className="text-white" />
        </div>
        <div>
          <p className="font-display text-white text-sm leading-none">Property Manager</p>
          <p className="text-white/40 text-xs font-sans mt-0.5">Nairobi</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                      const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");
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
