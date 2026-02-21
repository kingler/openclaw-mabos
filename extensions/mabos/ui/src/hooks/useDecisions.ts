import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DecisionResolution } from "@/lib/types";

export function useDecisions() {
  return useQuery({
    queryKey: ["decisions"],
    queryFn: () => api.getDecisions(),
    refetchInterval: 30_000,
  });
}

export function useResolveDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: DecisionResolution }) =>
      api.resolveDecision(id, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
    },
  });
}
