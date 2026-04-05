import { createContext, useContext, useState, type ReactNode } from "react";
import type { Business } from "@/lib/types";

interface BusinessContextValue {
  activeBusiness: Business | null;
  setActiveBusiness: (b: Business | null) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

const DEFAULT_BUSINESS: Business = {
  id: "vividwalls",
  name: "VividWalls",
  description: "Premium wall art e-commerce platform with AI-powered multi-agent system",
  stage: "mvp",
  agentCount: 20,
  healthScore: 100,
};

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(DEFAULT_BUSINESS);
  return (
    <BusinessContext.Provider value={{ activeBusiness, setActiveBusiness }}>
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
  const { activeBusiness } = useBusinessContext();
  return activeBusiness?.id ?? "default";
}
