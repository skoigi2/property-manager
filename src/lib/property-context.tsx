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
  /** Re-fetch the property list from the server. Call after creating/seeding a property. */
  refresh: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextValue>({
  properties: [],
  selectedId: null,
  setSelectedId: () => {},
  selected: null,
  loading: true,
  refresh: async () => {},
});

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProperties = useCallback(async () => {
    try {
      const r = await fetch("/api/properties", { cache: "no-store" });
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

  return (
    <PropertyContext.Provider value={{ properties, selectedId, setSelectedId, selected, loading, refresh: fetchProperties }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
