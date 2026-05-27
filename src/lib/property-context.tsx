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
  refresh: async () => {},
});

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
      // Restore from sessionStorage, else fall back to first property
      const stored = sessionStorage.getItem("selectedPropertyId");
      const match = data.find((p) => p.id === stored);
      setSelectedIdState((prev) => match ? stored : (prev && data.find((p) => p.id === prev) ? prev : (data[0]?.id ?? null)));
    } catch { /* ignore network errors — keep current state */ }
  }, []);

  useEffect(() => {
    fetchProperties().finally(() => setLoading(false));
  }, [fetchProperties]);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id);
    if (id) sessionStorage.setItem("selectedPropertyId", id);
    else sessionStorage.removeItem("selectedPropertyId");
  }, []);

  const selected = properties.find((p) => p.id === selectedId) ?? null;

  // Compute display currency once per render — selected wins, else the shared
  // currency across all properties if there's exactly one, else USD.
  const currency = (() => {
    if (selected) return selected.currency;
    if (properties.length === 0) return "USD";
    const first = properties[0].currency;
    return properties.every((p) => p.currency === first) ? first : "USD";
  })();

  return (
    <PropertyContext.Provider value={{ properties, selectedId, setSelectedId, selected, loading, currency, refresh: fetchProperties }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
