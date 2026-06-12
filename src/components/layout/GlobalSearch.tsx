"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Building2, FileText, Store, FolderOpen, Wrench, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  type: "tenant" | "property" | "invoice" | "vendor" | "case" | "maintenance";
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_META: Record<SearchResult["type"], { label: string; icon: typeof Users }> = {
  tenant:      { label: "Tenants",     icon: Users },
  property:    { label: "Properties",  icon: Building2 },
  invoice:     { label: "Invoices",    icon: FileText },
  vendor:      { label: "Vendors",     icon: Store },
  case:        { label: "Cases",       icon: FolderOpen },
  maintenance: { label: "Maintenance", icon: Wrench },
};

const GROUP_ORDER: SearchResult["type"][] = [
  "tenant", "property", "invoice", "case", "maintenance", "vendor",
];

/** Event name the Sidebar trigger dispatches to open the palette. */
export const OPEN_SEARCH_EVENT = "gw:open-global-search";

/**
 * Cmd/Ctrl+K command palette. Mounted once in the dashboard layout; not
 * rendered for OWNER role (the search API is manager-only).
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hotkey + custom-event open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    };
  }, []);

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      // Wait a tick for the input to mount
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setActiveIndex(0);
        }
      } catch {
        // network blip — leave previous results
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Flat, group-ordered list for keyboard navigation
  const ordered = GROUP_ORDER.flatMap((t) => results.filter((r) => r.type === t));

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      router.push(r.href);
    },
    [router]
  );

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && ordered[activeIndex]) {
      e.preventDefault();
      go(ordered[activeIndex]);
    }
  }

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          {loading ? (
            <Loader2 size={18} className="text-gray-400 animate-spin shrink-0" />
          ) : (
            <Search size={18} className="text-gray-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search tenants, invoices, cases, vendors…"
            className="flex-1 py-3.5 text-sm font-sans outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:block text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-sans">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length >= 2 && !loading && ordered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400 font-sans">
              No results for &ldquo;{query.trim()}&rdquo;
            </p>
          )}

          {GROUP_ORDER.map((type) => {
            const group = results.filter((r) => r.type === type);
            if (group.length === 0) return null;
            const Icon = TYPE_META[type].icon;
            return (
              <div key={type} className="py-1">
                <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-sans font-medium">
                  {TYPE_META[type].label}
                </p>
                {group.map((r) => {
                  flatIndex += 1;
                  const isActive = flatIndex === activeIndex;
                  const idx = flatIndex;
                  return (
                    <button
                      key={`${r.type}:${r.id}`}
                      onClick={() => go(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? "bg-gold/10" : ""
                      }`}
                    >
                      <Icon size={15} className={isActive ? "text-gold" : "text-gray-400"} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-sans text-gray-800 truncate">{r.title}</span>
                        {r.subtitle && (
                          <span className="block text-xs font-sans text-gray-400 truncate">{r.subtitle}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-400 font-sans">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </div>
      </div>
    </div>
  );
}
