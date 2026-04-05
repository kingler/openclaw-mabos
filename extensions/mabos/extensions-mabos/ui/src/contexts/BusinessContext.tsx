import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Business } from "@/lib/types";

const STORAGE_KEY = "mabos-active-business-id";

interface BusinessContextValue {
  /** All onboarded businesses. */
  businesses: Business[];
  /** Currently selected business (null if none selected or loading). */
  activeBusiness: Business | null;
  /** ID of the active business. */
  activeBusinessId: string | null;
  /** Switch to a different business by ID. */
  setActiveBusinessId: (id: string) => void;
  /** Whether the business list is loading. */
  isLoading: boolean;
  /** Re-fetch the business list (e.g. after onboarding a new one). */
  refresh: () => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchBusinesses = useCallback(async () => {
    setIsLoading(true);
    try {
      const { businesses: list } = await api.getBusinesses();
      setBusinesses(list);

      // If no active business selected, or selected one no longer exists, pick the first
      if (list.length > 0) {
        const currentValid = activeBusinessId && list.some((b) => b.id === activeBusinessId);
        if (!currentValid) {
          setActiveBusinessIdRaw(list[0].id);
          try {
            localStorage.setItem(STORAGE_KEY, list[0].id);
          } catch {}
        }
      } else {
        setActiveBusinessIdRaw(null);
      }
    } catch {
      // API not available — keep existing state
    } finally {
      setIsLoading(false);
    }
  }, [activeBusinessId]);

  // Fetch on mount
  useEffect(() => {
    fetchBusinesses();
  }, []);

  const setActiveBusinessId = useCallback((id: string) => {
    setActiveBusinessIdRaw(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) ?? null;

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        activeBusiness,
        activeBusinessId,
        setActiveBusinessId,
        isLoading,
        refresh: fetchBusinesses,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusinessContext must be used within BusinessProvider");
  return ctx;
}

export function useActiveBusinessId(): string {
  const { activeBusinessId } = useBusinessContext();
  return activeBusinessId ?? "default";
}
