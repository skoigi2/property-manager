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
} from "lucide-react";

const allMgrItems = [
  { href: "/dashboard",          label: "Dashboard",   icon: LayoutDashboard },
  { href: "/properties",         label: "Properties",  icon: Building2 },
  { href: "/income",             label: "Income",      icon: TrendingUp },
  { href: "/expenses",           label: "Expenses",    icon: Receipt },
  { href: "/petty-cash",         label: "Petty Cash",  icon: Wallet },
  { href: "/tenants",            label: "Tenants",     icon: Users },
  { href: "/invoices",           label: "Invoices",    icon: ScrollText },
  { href: "/maintenance",        label: "Maintenance", icon: Wrench },
  { href: "/arrears",            label: "Arrears",     icon: AlertTriangle },
  { href: "/insurance",          label: "Insurance",   icon: ShieldPlus },
  { href: "/assets",             label: "Assets",      icon: Package },
  { href: "/recurring-expenses", label: "Recurring",   icon: RepeatIcon },
  { href: "/import",             label: "Import",      icon: Upload },
  { href: "/report",             label: "Report",      icon: FileText },
  { href: "/settings",           label: "Settings",    icon: Settings },
  { href: "/settings/users",     label: "Users",       icon: UserCog },
  { href: "/settings/audit",     label: "Audit Log",   icon: ShieldCheck },
];

const mgrPrimary = [
  { href: "/dashboard", label: "Home",     icon: LayoutDashboard },
  { href: "/tenants",   label: "Tenants",  icon: Users },
  { href: "/income",    label: "Income",   icon: TrendingUp },
  { href: "/expenses",  label: "Expenses", icon: Receipt },
];

const accountantPrimary = [
  { href: "/dashboard",  label: "Home",     icon: LayoutDashboard },
  { href: "/income",     label: "Income",   icon: TrendingUp },
  { href: "/expenses",   label: "Expenses", icon: Receipt },
  { href: "/tenants",    label: "Tenants",  icon: Users },
];

const accountantDrawer = [
  { href: "/invoices",    label: "Invoices",    icon: ScrollText },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/report",      label: "Report",      icon: FileText },
];

const ownerItems = [
  { href: "/report", label: "Report", icon: FileText },
];

interface MobileNavProps {
  role?: string;
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (role === "OWNER") {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-header border-t border-white/10 z-40 safe-b">
        <div className="flex">
          {ownerItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={clsx("flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
                  pathname === item.href ? "text-gold" : "text-white/50 hover:text-white/80")}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  const primaryItems = role === "ACCOUNTANT" ? accountantPrimary : mgrPrimary;
  const drawerItems = role === "ACCOUNTANT"
    ? accountantDrawer
    : allMgrItems.filter((item) => !mgrPrimary.some((p) => p.href === item.href));
  // ADMIN gets same full access as MANAGER (already handled by falling through to mgrPrimary above)

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-header border-t border-white/10 z-40 safe-b">
        <div className="flex">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className={clsx("flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
                  isActive ? "text-gold" : "text-white/50 hover:text-white/80")}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={clsx("flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
              drawerOpen ? "text-gold" : "text-white/50 hover:text-white/80")}>
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setDrawerOpen(false)} />
          <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-header rounded-t-2xl z-50 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <p className="text-white font-sans font-medium text-sm">All Sections</p>
              <button onClick={() => setDrawerOpen(false)} className="text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-px bg-white/5">
              {drawerItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={clsx("flex flex-col items-center gap-2 py-5 bg-header transition-colors",
                      isActive ? "text-gold" : "text-white/60 hover:text-white")}>
                    <Icon size={22} />
                    <span className="text-xs font-sans text-center leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
