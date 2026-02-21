import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useContractors() {
  return useQuery({
    queryKey: ["contractors"],
    queryFn: () => api.getContractors(),
  });
}
