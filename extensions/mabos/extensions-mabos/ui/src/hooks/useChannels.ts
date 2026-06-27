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

export function useSetChannelEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.setChannelEnabled(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useRemoveChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useChannelStatus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["channelStatus", id],
    queryFn: () => api.getChannelStatus(id),
    enabled,
    refetchInterval: 30_000,
  });
}
