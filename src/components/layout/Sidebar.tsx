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
} from "lucide-react";
import { signOut } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[]; // which roles can see this
}

const navItems: NavItem[] = [
  { href: "/dashboard",       label: "Dashboard",   icon: LayoutDashboard, roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/properties",      label: "Properties",  icon: Building2,       roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/income",          label: "Income",      icon: TrendingUp,      roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/expenses",        label: "Expenses",    icon: Receipt,         roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/petty-cash",      label: "Petty Cash",  icon: Wallet,          roles: ["MANAGER"] },
  { href: "/tenants",         label: "Tenants",     icon: Users,           roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/invoices",        label: "Invoices",    icon: ScrollText,      roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/maintenance",          label: "Maintenance",  icon: Wrench,          roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/compliance",           label: "Compliance",   icon: BarChart3,        roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/arrears",              label: "Arrears",      icon: AlertTriangle,   roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/insurance",            label: "Insurance",    icon: ShieldPlus,      roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/assets",               label: "Assets",       icon: Package,         roles: ["MANAGER", "ACCOUNTANT"] },
  { href: "/recurring-expenses",   label: "Recurring",    icon: RepeatIcon,      roles: ["MANAGER"] },
  { href: "/import",               label: "Import",       icon: Upload,          roles: ["MANAGER"] },
  { href: "/report",               label: "Report",       icon: FileText,        roles: ["MANAGER", "ACCOUNTANT", "OWNER"] },
  { href: "/settings",             label: "Settings",     icon: Settings,        roles: ["MANAGER"] },
  { href: "/settings/users",       label: "Users",        icon: UserCog,         roles: ["MANAGER"] },
  { href: "/settings/audit",       label: "Audit Log",    icon: ShieldCheck,     roles: ["MANAGER"] },
];

interface SidebarProps {
  role?: string;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = navItems.filter(
    (item) => !role || role === "ADMIN" || item.roles.includes(role)
  );

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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-colors",
                isActive
                  ? "bg-gold text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              {item.label}
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
