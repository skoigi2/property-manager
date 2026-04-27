"use client";

import { signOut } from "next-auth/react";
import { LogOut, User, ChevronDown, Building2, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useProperty } from "@/lib/property-context";

interface HeaderProps {
  title: string;
  userName?: string | null;
  role?: string;
  children?: React.ReactNode;
}

export function Header({ title, userName, role, children }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const { properties, selectedId, setSelectedId, selected, loading } = useProperty();

  const showSelector = !loading && properties.length > 1;

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
            <span className="hidden sm:block">{userName ?? "User"}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-card-hover border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-medium text-header font-sans">{userName}</p>
                <p className="text-xs text-gray-400 font-sans">{role}</p>
              </div>
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
