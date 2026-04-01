"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, X, Plus, ChevronDown } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  CONTRACTOR:       "Contractor",
  SUPPLIER:         "Supplier",
  UTILITY_PROVIDER: "Utility Provider",
  SERVICE_PROVIDER: "Service Provider",
  CONSULTANT:       "Consultant",
  OTHER:            "Other",
};

interface Vendor {
  id:       string;
  name:     string;
  category: string;
  phone:    string | null;
}

interface VendorSelectProps {
  value:    string | null;
  onChange: (vendorId: string | null) => void;
  label?:   string;
  error?:   string;
  disabled?: boolean;
}

let vendorCache: Vendor[] | null = null;

export function VendorSelect({ value, onChange, label, error, disabled }: VendorSelectProps) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [vendors, setVendors]   = useState<Vendor[]>(vendorCache ?? []);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newCat, setNewCat]     = useState("OTHER");
  const [saving, setSaving]     = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const selected = vendors.find((v) => v.id === value) ?? null;

  // Fetch vendor list once, cache in module scope
  async function loadVendors() {
    if (vendorCache) { setVendors(vendorCache); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/vendors");
      const data = await res.json();
      vendorCache = data;
      setVendors(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setCreating(false);
    loadVendors();
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const filtered = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      (v.phone ?? "").includes(query)
  );

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/vendors", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName.trim(), category: newCat }),
      });
      if (!res.ok) return;
      const created: Vendor = await res.json();
      vendorCache = null; // invalidate cache
      setVendors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setOpen(false);
      setCreating(false);
      setNewName("");
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-sans font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        disabled={disabled}
        className={[
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-sans text-left transition-colors",
          "bg-cream focus:outline-none",
          error
            ? "border-red-300 focus:ring-2 focus:ring-red-200"
            : open
            ? "border-gold ring-2 ring-gold/20"
            : "border-gray-200 hover:border-gray-300",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <Building2 size={14} className="text-gray-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? selected.name : "Select vendor…"}
        </span>
        {selected && (
          <span
            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          >
            <X size={13} />
          </span>
        )}
        {!selected && <ChevronDown size={13} className="text-gray-300 shrink-0" />}
      </button>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCreating(false); }}
              placeholder="Search vendors…"
              className="w-full text-sm font-sans px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {loading && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">Loading…</div>
            )}
            {!loading && filtered.length === 0 && !creating && (
              <div className="px-3 py-3 text-sm text-gray-400">No vendors found</div>
            )}
            {!loading && filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false); }}
                className={[
                  "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-sans transition-colors",
                  value === v.id ? "bg-gold/10 text-gold" : "hover:bg-gray-50 text-gray-800",
                ].join(" ")}
              >
                <Building2 size={13} className={value === v.id ? "text-gold" : "text-gray-400"} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.name}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {CATEGORY_LABELS[v.category] ?? v.category}
                    {v.phone ? ` · ${v.phone}` : ""}
                  </div>
                </div>
                {value === v.id && <X size={11} className="text-gold shrink-0" onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }} />}
              </button>
            ))}
          </div>

          {/* Quick-create */}
          {!creating ? (
            <button
              type="button"
              onClick={() => { setCreating(true); setNewName(query); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-sans text-gold hover:bg-gold/5 border-t border-gray-100 transition-colors"
            >
              <Plus size={13} />
              Add vendor{query ? ` "${query}"` : ""}
            </button>
          ) : (
            <div className="border-t border-gray-100 p-2 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Vendor name*"
                className="w-full text-sm font-sans px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-full text-sm font-sans px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !newName.trim()}
                  className="flex-1 py-1.5 text-xs font-sans font-medium bg-gold text-white rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 py-1.5 text-xs font-sans text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
