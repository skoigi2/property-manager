"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export interface PropertyOption {
  id: string;
  name: string;
  type: "AIRBNB" | "LONGTERM";
  currency: string;
}

interface PropertyContextValue {
  properties: PropertyOption[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: PropertyOption | null;
  loading: boolean;
  /**
   * Display currency for the current scope.
   *
   * - If a property is selected → that property's currency.
   * - Else if every accessible property shares the same currency → that shared currency.
   * - Else (mixed-currency portfolio) → "USD" as a safe fallback.
   *
   * Use this instead of `selected?.currency ?? "USD"` so the "All properties"
   * view doesn't silently revert to dollars when the org uses (e.g.) KES.
   */
  currency: string;
  /**
   * True when in "All properties" scope AND the accessible properties use more
   * than one currency — portfolio totals are then a mixed-currency sum shown
   * under the fallback label. Surface a caveat wherever aggregates render.
   */
  mixedCurrencies: boolean;
  /** Re-fetch the property list from the server. Call after creating/seeding a property. */
  refresh: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextValue>({
  properties: [],
  selectedId: null,
  setSelectedId: () => {},
  selected: null,
  loading: true,
  currency: "USD",
  mixedCurrencies: false,
  refresh: async () => {},
});

/** sessionStorage sentinel for an explicit "All properties" choice. */
const ALL_SENTINEL = "__ALL__";

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProperties = useCallback(async () => {
    try {
      // ?minimal=true returns only { id, name, type, currency } — much smaller
      // payload for the header selector. The Properties page uses the full
      // endpoint when it actually needs unit metadata.
      const r = await fetch("/api/properties?minimal=true", { cache: "no-store" });
      const data: PropertyOption[] = await r.json();
      setProperties(data);
      // Restore from sessionStorage. Cold-load default is the PORTFOLIO view
      // ("All properties") so multi-property managers land on the full picture;
      // single-property orgs scope to their one property (keeps the dashboard
      // SetupChecklist visible for fresh orgs).
      const stored = sessionStorage.getItem("selectedPropertyId");
      const match = data.find((p) => p.id === stored);
      setSelectedIdState((prev) => {
        if (match) return stored;
        if (stored === ALL_SENTINEL) return null;
        if (prev && data.find((p) => p.id === prev)) return prev;
        return data.length === 1 ? data[0].id : null;
      });
    } catch { /* ignore network errors — keep current state */ }
  }, []);

  useEffect(() => {
    fetchProperties().finally(() => setLoading(false));
  }, [fetchProperties]);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id);
    // Persist "All properties" explicitly so it survives navigation the same
    // way a concrete selection does.
    sessionStorage.setItem("selectedPropertyId", id ?? ALL_SENTINEL);
  }, []);

  const selected = properties.find((p) => p.id === selectedId) ?? null;

  const sharedCurrency = (() => {
    if (properties.length === 0) return null;
    const first = properties[0].currency;
    return properties.every((p) => p.currency === first) ? first : null;
  })();

  // Compute display currency once per render — selected wins, else the shared
  // currency across all properties if there's exactly one, else USD.
  const currency = selected ? selected.currency : sharedCurrency ?? "USD";
  const mixedCurrencies = !selected && properties.length > 1 && sharedCurrency === null;

  return (
    <PropertyContext.Provider value={{ properties, selectedId, setSelectedId, selected, loading, currency, mixedCurrencies, refresh: fetchProperties }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
