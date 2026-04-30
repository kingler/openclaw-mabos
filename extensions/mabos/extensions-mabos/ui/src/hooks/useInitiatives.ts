import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useInitiatives(params?: { status?: string }) {
  return useQuery({
    queryKey: ["erp", "initiatives", params],
    queryFn: () => api.getInitiatives(),
    select: (data) => {
      if (!params?.status || params.status === "all") return data;
      return {
        initiatives: data.initiatives.filter((i) => i.status === params.status),
      };
    },
  });
}
