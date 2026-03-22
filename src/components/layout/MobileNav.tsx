"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { LayoutDashboard, TrendingUp, Receipt, Wallet, FileText, Building2, Wrench, ScrollText } from "lucide-react";

const mgrItems = [
  { href: "/dashboard",   label: "Home",      icon: LayoutDashboard },
  { href: "/income",      label: "Income",    icon: TrendingUp },
  { href: "/expenses",    label: "Expenses",  icon: Receipt },
  { href: "/invoices",    label: "Invoices",  icon: ScrollText },
  { href: "/maintenance", label: "Maintain",  icon: Wrench },
];

const accountantItems = [
  { href: "/dashboard",  label: "Home",       icon: LayoutDashboard },
  { href: "/income",     label: "Income",     icon: TrendingUp },
  { href: "/expenses",   label: "Expenses",   icon: Receipt },
  { href: "/report",     label: "Report",     icon: FileText },
];

const ownerItems = [
  { href: "/report", label: "Report", icon: FileText },
];

interface MobileNavProps {
  role?: string;
}

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const items =
    role === "OWNER" ? ownerItems :
    role === "ACCOUNTANT" ? accountantItems :
    mgrItems;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-header border-t border-white/10 z-40 safe-b">
      <div className="flex">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-sans transition-colors",
                isActive ? "text-gold" : "text-white/50 hover:text-white/80"
              )}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
