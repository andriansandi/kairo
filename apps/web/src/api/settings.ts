import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConflictThresholds } from '@kairo/conflict-engine';
import { apiFetch } from './client';

export type MatchWeights = {
  skill: number;
  availability: number;
  context: number;
  role: number;
};

export type AiConfig = {
  configured: boolean;
  provider?: string;
  model?: string;
  gateway_url?: string;
};

export type Settings = {
  conflict_thresholds: ConflictThresholds;
  match_weights: MatchWeights;
  ai_config: AiConfig;
};

export type SettingsUpdate = {
  conflict_thresholds?: Partial<ConflictThresholds>;
  match_weights?: Partial<MatchWeights>;
  ai_config?: {
    gateway_url?: string;
    provider?: string;
    model?: string;
    api_key?: string;
  };
};

export function useSettings() {
  return useQuery<Settings, Error>({
    queryKey: ['settings'],
    queryFn: () => apiFetch<Settings>('/api/v1/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation<Settings, Error, SettingsUpdate>({
    mutationFn: (body) =>
      apiFetch<Settings>('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
