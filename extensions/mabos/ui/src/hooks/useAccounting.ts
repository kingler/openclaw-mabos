import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useInvoices(params?: { status?: string }) {
  return useQuery({
    queryKey: ["erp", "finance", "invoices", params],
    queryFn: () => api.getInvoices(params),
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["erp", "finance", "accounts"],
    queryFn: api.getAccounts,
  });
}

export function useProfitLoss(from: string, to: string) {
  return useQuery({
    queryKey: ["erp", "finance", "profit-loss", from, to],
    queryFn: () => api.getProfitLoss(from, to),
  });
}
