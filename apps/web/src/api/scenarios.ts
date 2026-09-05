import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScenarioDefinition, ScenarioOp } from '@kairo/types';
import { apiFetch } from './client';

export interface EngineConflict {
  rule:
    | 'C1'
    | 'C2'
    | 'C3'
    | 'C4'
    | 'C5'
    | 'C6'
    | 'C7'
    | 'C8'
    | 'C9'
    | 'C10';
  severity: 'warning' | 'at_risk' | 'critical';
  person_id?: string;
  team_id?: string;
  project_id?: string;
  phase_id?: string;
  window_start: string;
  window_end: string;
  metrics: Record<string, number | string>;
  explanation: string;
}

export interface ScenarioDiffResult {
  summary: {
    utilization_changed_person_weeks: number;
    conflicts_added: number;
    conflicts_removed: number;
    feasibility_changed_projects: number;
  };
  capacity_deltas: {
    person_id: string;
    week_key: string;
    base_utilization: number;
    scenario_utilization: number;
    delta: number;
  }[];
  conflict_changes: {
    added: EngineConflict[];
    removed: EngineConflict[];
  };
  feasibility_deltas: {
    project_id: string;
    base: { verdict: string; computed_finish: string };
    scenario: { verdict: string; computed_finish: string };
  }[];
}

export interface ScenarioWithDiff {
  scenario: ScenarioDefinition;
  diff: ScenarioDiffResult | null;
}

export interface RecomputeResponse {
  scenario: ScenarioDefinition;
  diff: ScenarioDiffResult;
  summary: ScenarioDiffResult['summary'];
}

export type CreateScenarioBody = {
  name: string;
  ops: ScenarioOp[];
};

export function useScenarios() {
  return useQuery<{ items: ScenarioDefinition[] }, Error>({
    queryKey: ['scenarios'],
    queryFn: () => apiFetch<{ items: ScenarioDefinition[] }>('/api/v1/scenarios'),
  });
}

export function useScenario(id: string | null) {
  return useQuery<ScenarioWithDiff, Error>({
    queryKey: ['scenario', id],
    queryFn: () => apiFetch<ScenarioWithDiff>(`/api/v1/scenarios/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useCreateScenario() {
  const queryClient = useQueryClient();
  return useMutation<{ scenario: ScenarioDefinition }, Error, CreateScenarioBody>({
    mutationFn: (body) =>
      apiFetch<{ scenario: ScenarioDefinition }>('/api/v1/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });
}

export function useRecomputeScenario() {
  const queryClient = useQueryClient();
  return useMutation<RecomputeResponse, Error, string>({
    mutationFn: (id) =>
      apiFetch<RecomputeResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/recompute`, {
        method: 'POST',
      }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/scenarios/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });
}
