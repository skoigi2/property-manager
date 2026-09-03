"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, X, Plus, ChevronDown } from "lucide-react";
import { HelpTip } from "./HelpTip";

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
  /** Short contextual tip shown in a hover tooltip next to the label */
  tooltip?: string;
}

// Module-level cache of GET /api/vendors for this browser session. The shape
// is whatever the API returned for the CURRENT role (CARETAKER gets a trimmed
// projection) — safe because a role change only happens via sign-out or an
// org switch, both of which are full page loads that reset module state.
let vendorCache: Vendor[] | null = null;

interface DuplicateVendor { id: string; name: string; category: string; phone: string | null }

export function VendorSelect({ value, onChange, label, error, disabled, tooltip }: VendorSelectProps) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [vendors, setVendors]   = useState<Vendor[]>(vendorCache ?? []);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newCat, setNewCat]     = useState("OTHER");
  const [saving, setSaving]     = useState(false);
  // Quick-create "More details" — lets whoever meets the contractor on site
  // capture them completely (phone, email, tax id, bank details) in one pass
  // instead of leaving a half-populated vendor a manager must chase later.
  const [moreOpen, setMoreOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newBank, setNewBank]   = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<DuplicateVendor | null>(null);
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

  function resetCreate() {
    setCreating(false);
    setMoreOpen(false);
    setNewName(""); setNewPhone(""); setNewEmail(""); setNewTaxId(""); setNewBank(""); setNewNotes("");
    setCreateError(null);
    setDuplicateOf(null);
  }

  async function handleCreate(allowDuplicate = false) {
    if (!newName.trim()) return;
    setSaving(true);
    setCreateError(null);
    try {
      const res  = await fetch("/api/vendors", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        newName.trim(),
          category:    newCat,
          phone:       newPhone.trim() || null,
          email:       newEmail.trim() || null,
          taxId:       newTaxId.trim() || null,
          bankDetails: newBank.trim() || null,
          notes:       newNotes.trim() || null,
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        }),
      });
      if (res.status === 409) {
        // Soft duplicate warning — offer "use existing" / "create anyway".
        const err = await res.json().catch(() => ({}));
        if (err?.code === "DUPLICATE_VENDOR" && err.existing) {
          setDuplicateOf(err.existing as DuplicateVendor);
          return;
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err?.error === "string" ? err.error : "Could not create vendor";
        setCreateError(msg);
        return;
      }
      const created: Vendor = await res.json();
      vendorCache = null; // invalidate cache
      setVendors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setOpen(false);
      resetCreate();
    } catch {
      setCreateError("Could not create vendor");
    } finally {
      setSaving(false);
    }
  }

  function useExisting(v: DuplicateVendor) {
    // The existing vendor may not be in the local list yet (cache from before
    // another user added it) — add it so the selection renders.
    setVendors((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, { id: v.id, name: v.name, category: v.category, phone: v.phone }]));
    onChange(v.id);
    setOpen(false);
    resetCreate();
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="flex items-center gap-1.5 text-caption font-medium text-gray-600 mb-1">
          {label}
          {tooltip && <HelpTip text={tooltip} />}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        disabled={disabled}
        className={[
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-body text-left transition-colors",
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

      {error && <p className="mt-1 text-caption text-red-500">{error}</p>}

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
              className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {loading && (
              <div className="px-3 py-4 text-center text-body text-gray-400">Loading…</div>
            )}
            {!loading && filtered.length === 0 && !creating && (
              <div className="px-3 py-3 text-body text-gray-400">No vendors found</div>
            )}
            {!loading && filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false); }}
                className={[
                  "w-full flex items-center gap-2 px-3 py-2.5 text-left text-body transition-colors",
                  value === v.id ? "bg-gold/10 text-gold" : "hover:bg-gray-50 text-gray-800",
                ].join(" ")}
              >
                <Building2 size={13} className={value === v.id ? "text-gold" : "text-gray-400"} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.name}</div>
                  <div className="text-caption text-gray-400 truncate">
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
              className="w-full flex items-center gap-2 px-3 py-2.5 text-body text-gold hover:bg-gold/5 border-t border-gray-100 transition-colors"
            >
              <Plus size={13} />
              Add vendor{query ? ` "${query}"` : ""}
            </button>
          ) : (
            <div className="border-t border-gray-100 p-2 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setDuplicateOf(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Vendor name*"
                className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>

              {/* More details — capture the contractor completely in one pass */}
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="text-caption text-gray-500 hover:text-gold transition-colors"
              >
                {moreOpen ? "Hide details" : "More details (phone, email, tax ID, bank)…"}
              </button>
              {moreOpen && (
                <div className="space-y-2">
                  <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone" className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream" />
                  <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" type="email" className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream" />
                  <input value={newTaxId} onChange={(e) => setNewTaxId(e.target.value)} placeholder="Tax ID (KRA PIN)" className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream" />
                  <textarea value={newBank} onChange={(e) => setNewBank(e.target.value)} placeholder="Bank name, account number, paybill…" rows={2} className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream" />
                  <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes" className="w-full text-body px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/30 bg-cream" />
                </div>
              )}

              {duplicateOf && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-caption text-amber-900 space-y-1.5">
                  <p>
                    A vendor called <span className="font-medium">{duplicateOf.name}</span>
                    {duplicateOf.phone ? ` (${duplicateOf.phone})` : ""} already exists — use it instead?
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => useExisting(duplicateOf)} className="flex-1 py-1 font-medium bg-gold text-white rounded-lg hover:bg-gold-dark transition-colors">
                      Use existing
                    </button>
                    <button type="button" onClick={() => handleCreate(true)} disabled={saving} className="flex-1 py-1 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50">
                      Create anyway
                    </button>
                  </div>
                </div>
              )}
              {createError && <p className="text-caption text-red-500">{createError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCreate()}
                  disabled={saving || !newName.trim()}
                  className="flex-1 py-1.5 text-caption font-medium bg-gold text-white rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={resetCreate}
                  className="flex-1 py-1.5 text-caption text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
