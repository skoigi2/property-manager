"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard, TrendingUp, Receipt, FileText,
  Users, Wallet, ScrollText, Wrench, AlertTriangle,
  ShieldPlus, Package, RepeatIcon, Upload, Settings,
  UserCog, ShieldCheck, Building2, MoreHorizontal, X,
  BarChart3, CalendarDays,
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
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/tenants",    label: "Tenants",    icon: Users },
  { href: "/income",     label: "Income",     icon: TrendingUp },
  { href: "/airbnb",     label: "Airbnb",     icon: CalendarDays },
];

const accountantPrimary: NavItem[] = [
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/tenants",    label: "Tenants",    icon: Users },
  { href: "/income",     label: "Income",     icon: TrendingUp },
  { href: "/airbnb",     label: "Airbnb",     icon: CalendarDays },
];

const ownerItems: NavItem[] = [
  { href: "/report", label: "Report", icon: FileText },
];

// Grouped drawer sections per role
const mgrDrawerSections: DrawerSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
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
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/assets",      label: "Assets",      icon: Package },
      { href: "/vendors",     label: "Vendors",     icon: Building2 },
      { href: "/insurance",   label: "Insurance",   icon: ShieldPlus },
      { href: "/compliance",  label: "Compliance",  icon: BarChart3 },
    ],
  },
  {
    heading: "Settings",
    items: [
      { href: "/settings",       label: "Settings",  icon: Settings },
      { href: "/settings/users", label: "Users",     icon: UserCog },
      { href: "/settings/audit", label: "Audit Log", icon: ShieldCheck },
      { href: "/import",         label: "Import",    icon: Upload },
    ],
  },
];

const accountantDrawerSections: DrawerSection[] = [
  {
    heading: "Overview",
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
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
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/vendors",     label: "Vendors",     icon: Building2 },
      { href: "/compliance",  label: "Compliance",  icon: BarChart3 },
    ],
  },
];

interface MobileNavProps {
  role?: string;
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
                  "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
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

  const primaryItems = role === "ACCOUNTANT" ? accountantPrimary : mgrPrimary;
  const drawerSections =
    role === "ACCOUNTANT" ? accountantDrawerSections : mgrDrawerSections;

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
                  "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
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
              "flex-1 min-w-0 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
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
              <p className="text-white font-sans font-medium text-sm">More</p>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-5">
              {drawerSections.map((section) => (
                <div key={section.heading}>
                  <p className="text-white/30 text-xs font-sans uppercase tracking-widest mb-2 px-1">
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
                          <span className="text-xs font-sans text-center leading-tight">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
