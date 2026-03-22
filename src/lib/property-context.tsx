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
}

interface PropertyContextValue {
  properties: PropertyOption[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: PropertyOption | null;
  loading: boolean;
}

const PropertyContext = createContext<PropertyContextValue>({
  properties: [],
  selectedId: null,
  setSelectedId: () => {},
  selected: null,
  loading: true,
});

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data: PropertyOption[]) => {
        setProperties(data);
        // Default to first property (or restore from sessionStorage)
        const stored = sessionStorage.getItem("selectedPropertyId");
        const match = data.find((p) => p.id === stored);
        setSelectedIdState(match ? stored : (data[0]?.id ?? null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id);
    if (id) sessionStorage.setItem("selectedPropertyId", id);
    else sessionStorage.removeItem("selectedPropertyId");
  }, []);

  const selected = properties.find((p) => p.id === selectedId) ?? null;

  return (
    <PropertyContext.Provider value={{ properties, selectedId, setSelectedId, selected, loading }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
