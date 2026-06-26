/**
 * React Query hooks for channel integration (connect messengers from the UI).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProvisionChannelBody } from "@/lib/types";

export function useChannelCatalog() {
  return useQuery({
    queryKey: ["channelCatalog"],
    queryFn: () => api.getChannelCatalog(),
    select: (data) => data.channels,
    staleTime: 5 * 60_000,
  });
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.getChannels(),
    select: (data) => data.channels,
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (body: { channel_type: string; credentials: Record<string, string> }) =>
      api.testChannel(body),
  });
}

export function useSaveChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProvisionChannelBody) => api.saveChannel(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}
