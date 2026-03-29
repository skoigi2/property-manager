"use client";
import { useState, useEffect, useRef } from "react";
import { User, Plus, Upload, Trash2, X, Loader2, FileText, Star, ChevronDown, ChevronUp, Pencil, Check } from "lucide-react";
import { clsx } from "clsx";

interface GuestDoc {
  id: string;
  label: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  url?: string | null;
}

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passportNumber: string | null;
  preferences: string | null;
  documents: GuestDoc[];
  _count: { bookings: number };
}

interface BookingGuest {
  id: string;
  guestId: string;
  isPrimary: boolean;
  guest: Guest;
}

interface Props {
  incomeEntryId: string;
}

function fmtBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function GuestPanel({ incomeEntryId }: Props) {
  const [bookingGuests, setBookingGuests] = useState<BookingGuest[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showAdd, setShowAdd]             = useState(false);

  // Search / create state
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<Guest[]>([]);
  const [searching, setSearching]       = useState(false);
  const [showNewForm, setShowNewForm]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [newGuest, setNewGuest]         = useState({ name: "", email: "", phone: "", nationality: "", passportNumber: "", preferences: "" });

  // Per-guest upload state
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadFile, setUploadFile]     = useState<{ [guestId: string]: File | null }>({});
  const fileRefs = useRef<{ [guestId: string]: HTMLInputElement | null }>({});

  // Per-guest preferences edit
  const [editingPrefs, setEditingPrefs] = useState<string | null>(null);
  const [prefsValue, setPrefsValue]     = useState("");

  // Remove / delete state
  const [removingGuest, setRemovingGuest] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc]     = useState<string | null>(null);

  // ── Load guests for this booking ───────────────────────────────────────────
  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${incomeEntryId}/guests`);
      if (res.ok) setBookingGuests(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [incomeEntryId]);

  // ── Search existing guests ─────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/guests?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const all: Guest[] = await res.json();
          // Filter out already-linked guests
          const linked = new Set(bookingGuests.map((bg) => bg.guestId));
          setSearchResults(all.filter((g) => !linked.has(g.id)));
        }
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, bookingGuests]);

  // ── Link existing guest ────────────────────────────────────────────────────
  async function linkGuest(guestId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${incomeEntryId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, isPrimary: bookingGuests.length === 0 }),
      });
      if (res.ok) {
        setSearchQuery("");
        setSearchResults([]);
        await load();
      }
    } finally { setSubmitting(false); }
  }

  // ── Create & link new guest ────────────────────────────────────────────────
  async function createGuest() {
    if (!newGuest.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${incomeEntryId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPrimary: bookingGuests.length === 0,
          name: newGuest.name,
          email: newGuest.email || undefined,
          phone: newGuest.phone || undefined,
          nationality: newGuest.nationality || undefined,
          passportNumber: newGuest.passportNumber || undefined,
          preferences: newGuest.preferences || undefined,
        }),
      });
      if (res.ok) {
        setNewGuest({ name: "", email: "", phone: "", nationality: "", passportNumber: "", preferences: "" });
        setShowNewForm(false);
        setShowAdd(false);
        await load();
      }
    } finally { setSubmitting(false); }
  }

  // ── Remove guest from booking ──────────────────────────────────────────────
  async function removeGuest(guestId: string) {
    setRemovingGuest(guestId);
    try {
      await fetch(`/api/bookings/${incomeEntryId}/guests/${guestId}`, { method: "DELETE" });
      setBookingGuests((prev) => prev.filter((bg) => bg.guestId !== guestId));
    } finally { setRemovingGuest(null); }
  }

  // ── Upload document for guest ──────────────────────────────────────────────
  async function uploadDoc(guestId: string) {
    const file = uploadFile[guestId];
    if (!file) return;
    setUploadingFor(guestId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
      const res = await fetch(`/api/guests/${guestId}/documents`, { method: "POST", body: fd });
      if (res.ok) {
        setUploadFile((prev) => ({ ...prev, [guestId]: null }));
        await load();
      }
    } finally { setUploadingFor(null); }
  }

  // ── Delete guest document ──────────────────────────────────────────────────
  async function deleteDoc(guestId: string, docId: string) {
    setDeletingDoc(docId);
    try {
      await fetch(`/api/guests/${guestId}/documents/${docId}`, { method: "DELETE" });
      await load();
    } finally { setDeletingDoc(null); }
  }

  // ── Save preferences edit ──────────────────────────────────────────────────
  async function savePrefs(guestId: string) {
    await fetch(`/api/guests/${guestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: prefsValue }),
    });
    setBookingGuests((prev) =>
      prev.map((bg) => bg.guestId === guestId
        ? { ...bg, guest: { ...bg.guest, preferences: prefsValue } }
        : bg
      )
    );
    setEditingPrefs(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-sm text-gray-400 font-sans">
        <Loader2 size={14} className="animate-spin" /> Loading guests…
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={14} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-500 font-sans uppercase tracking-wide">
            Guests {bookingGuests.length > 0 && `(${bookingGuests.length})`}
          </span>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setShowNewForm(false); setSearchQuery(""); }}
          className="flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-dark font-sans transition-colors"
        >
          {showAdd ? <X size={12} /> : <Plus size={12} />}
          {showAdd ? "Cancel" : "Add Guest"}
        </button>
      </div>

      {/* Add guest panel */}
      {showAdd && (
        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-3">
          {!showNewForm ? (
            <>
              {/* Search existing */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search returning guest by name or email…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
                  autoFocus
                />
                {searching && <Loader2 size={14} className="animate-spin absolute right-3 top-2.5 text-gray-400" />}
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-700 font-sans">{g.name}</p>
                        <p className="text-xs text-gray-400 font-sans">
                          {g.nationality && `${g.nationality} · `}{g.email ?? ""}
                          {g._count.bookings > 1 && <span className="text-gold ml-1">★ {g._count.bookings} stays</span>}
                        </p>
                        {g.preferences && (
                          <p className="text-xs text-gray-500 font-sans italic mt-0.5 line-clamp-1">{g.preferences}</p>
                        )}
                      </div>
                      <button
                        disabled={submitting}
                        onClick={() => linkGuest(g.id)}
                        className="text-xs font-medium text-gold hover:text-gold-dark font-sans disabled:opacity-50 whitespace-nowrap ml-4"
                      >
                        Link to booking
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.trim() && !searching && searchResults.length === 0 && (
                <p className="text-xs text-gray-400 font-sans">No existing guests found.</p>
              )}

              <button
                onClick={() => setShowNewForm(true)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 font-sans underline underline-offset-2"
              >
                + New guest
              </button>
            </>
          ) : (
            /* New guest form */
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 font-sans uppercase tracking-wide">New Guest</p>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Full name *" value={newGuest.name} onChange={(e) => setNewGuest((p) => ({ ...p, name: e.target.value }))}
                  className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30" />
                <input placeholder="Email" value={newGuest.email} onChange={(e) => setNewGuest((p) => ({ ...p, email: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30" />
                <input placeholder="Phone" value={newGuest.phone} onChange={(e) => setNewGuest((p) => ({ ...p, phone: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30" />
                <input placeholder="Nationality" value={newGuest.nationality} onChange={(e) => setNewGuest((p) => ({ ...p, nationality: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30" />
                <input placeholder="Passport / ID number" value={newGuest.passportNumber} onChange={(e) => setNewGuest((p) => ({ ...p, passportNumber: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30" />
              </div>
              <textarea placeholder="Preferences, requests, dietary needs, complaints…" value={newGuest.preferences}
                onChange={(e) => setNewGuest((p) => ({ ...p, preferences: e.target.value }))} rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none" />
              <div className="flex gap-2">
                <button
                  disabled={!newGuest.name.trim() || submitting}
                  onClick={createGuest}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gold text-white text-sm font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add Guest
                </button>
                <button onClick={() => setShowNewForm(false)} className="px-3 py-2 text-sm font-sans text-gray-500 hover:text-gray-700">Back</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Guest cards */}
      {bookingGuests.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 font-sans italic">No guests recorded for this booking.</p>
      )}

      <div className="space-y-3">
        {bookingGuests.map(({ guestId, isPrimary, guest: g }) => (
          <div key={guestId} className="border border-gray-100 rounded-xl bg-white p-4 space-y-3">
            {/* Guest header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                  <User size={13} className="text-gold" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-header font-sans truncate">{g.name}</p>
                    {isPrimary && <span className="text-gold"><Star size={11} fill="currentColor" /></span>}
                    {g._count.bookings > 1 && (
                      <span className="text-xs text-gold font-sans">★ {g._count.bookings} stays</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-sans">
                    {[g.nationality, g.passportNumber ? `Passport: ${g.passportNumber}` : null, g.email, g.phone]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <button
                disabled={removingGuest === guestId}
                onClick={() => removeGuest(guestId)}
                className="shrink-0 p-1 text-gray-300 hover:text-expense transition-colors rounded disabled:opacity-50"
                title="Remove from booking"
              >
                {removingGuest === guestId ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              </button>
            </div>

            {/* Preferences */}
            <div>
              {editingPrefs === guestId ? (
                <div className="flex gap-2 items-start">
                  <textarea
                    value={prefsValue}
                    onChange={(e) => setPrefsValue(e.target.value)}
                    rows={2}
                    placeholder="Preferences, requests, complaints…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
                    autoFocus
                  />
                  <button onClick={() => savePrefs(guestId)} className="p-1.5 text-gold hover:text-gold-dark">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingPrefs(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingPrefs(guestId); setPrefsValue(g.preferences ?? ""); }}
                  className="group flex items-start gap-1.5 text-left w-full"
                >
                  {g.preferences ? (
                    <p className="text-xs text-gray-500 font-sans italic flex-1">{g.preferences}</p>
                  ) : (
                    <p className="text-xs text-gray-300 font-sans italic flex-1">Add preferences, requests or notes…</p>
                  )}
                  <Pencil size={11} className="text-gray-300 group-hover:text-gold mt-0.5 shrink-0 transition-colors" />
                </button>
              )}
            </div>

            {/* Documents */}
            <div className="space-y-1.5">
              {g.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-xs font-sans text-gray-600">
                  <FileText size={12} className="text-gray-400 shrink-0" />
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 truncate hover:text-gold transition-colors">
                      {doc.label}
                    </a>
                  ) : (
                    <span className="flex-1 truncate">{doc.label}</span>
                  )}
                  {doc.fileSize && <span className="text-gray-400 shrink-0">{fmtBytes(doc.fileSize)}</span>}
                  <button
                    disabled={deletingDoc === doc.id}
                    onClick={() => deleteDoc(guestId, doc.id)}
                    className="text-gray-300 hover:text-expense transition-colors disabled:opacity-50"
                  >
                    {deletingDoc === doc.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              ))}

              {/* Upload trigger */}
              <div className="flex items-center gap-2">
                <input
                  ref={(el) => { fileRefs.current[guestId] = el; }}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploadFile((prev) => ({ ...prev, [guestId]: f }));
                  }}
                />
                {uploadFile[guestId] ? (
                  <>
                    <span className="text-xs text-gray-500 font-sans truncate flex-1">{uploadFile[guestId]!.name}</span>
                    <button
                      disabled={uploadingFor === guestId}
                      onClick={() => uploadDoc(guestId)}
                      className="flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-dark font-sans disabled:opacity-50"
                    >
                      {uploadingFor === guestId ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                      Upload
                    </button>
                    <button onClick={() => setUploadFile((prev) => ({ ...prev, [guestId]: null }))}
                      className="text-gray-300 hover:text-expense"><X size={11} /></button>
                  </>
                ) : (
                  <button
                    onClick={() => fileRefs.current[guestId]?.click()}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gold font-sans transition-colors"
                  >
                    <Upload size={11} /> Upload passport / ID
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
