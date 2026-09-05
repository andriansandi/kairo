import { useMutation, useQuery } from '@tanstack/react-query';
import type { ScenarioOp } from '@kairo/types';
import { apiFetch } from './client';

export type FeasibilityVerdict = 'healthy' | 'warning' | 'at_risk' | 'critical';

export type FeasibilityResult = {
  id: string;
  project_id: string;
  snapshot_id: string;
  computed_start: string;
  computed_finish: string;
  slack_days: number;
  buffer_days: number;
  verdict: FeasibilityVerdict;
  drivers: string[];
  critical_path: string[];
  per_phase_load: Record<string, number>;
};

export type AlternativeStrategy =
  | 'level_resources'
  | 'borrow_resources'
  | 'extend_deadline'
  | 'reduce_scope';

export type Alternative = {
  id: string;
  strategy: AlternativeStrategy;
  description: string;
  ops: ScenarioOp[];
  tradeoffs: string[];
  computed_finish?: string;
  buffer_days?: number;
};

export function useFeasibility(projectId: string) {
  return useQuery<{ feasibility: FeasibilityResult | null }, Error>({
    queryKey: ['feasibility', projectId],
    queryFn: () =>
      apiFetch<{ feasibility: FeasibilityResult | null }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/feasibility`,
      ),
    enabled: !!projectId,
  });
}

export function useGenerateAlternatives(projectId: string) {
  return useMutation<{ alternatives: Alternative[] }, Error>({
    mutationFn: () =>
      apiFetch<{ alternatives: Alternative[] }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/alternatives`,
        {
          method: 'POST',
        },
      ),
  });
}
