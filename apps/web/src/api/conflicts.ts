import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConflictRule, Paginated, WeekKey } from '@kairo/types';
export type { ConflictRule } from '@kairo/types';
import { apiFetch } from './client';

export type ConflictSeverity = 'warning' | 'at_risk' | 'critical';
export type ConflictStatus = 'open' | 'acknowledged' | 'resolved';

export type ConflictView = {
  id: string;
  snapshot_id: string;
  rule: ConflictRule;
  severity: ConflictSeverity;
  status: ConflictStatus;
  person_id?: string;
  team_id?: string;
  project_id?: string;
  phase_id?: string;
  window_start: WeekKey;
  window_end: WeekKey;
  metrics: Record<string, number | string>;
  explanation: string;
  person_name?: string;
  team_name?: string;
  project_name?: string;
  phase_name?: string;
};

export type ConflictFilters = {
  severity?: ConflictSeverity;
  rule?: ConflictRule;
  project_id?: string;
  status?: ConflictStatus;
  limit?: number;
  cursor?: string | null;
};

export function useConflicts(filters: ConflictFilters = {}) {
  return useQuery<Paginated<ConflictView>, Error>({
    queryKey: ['conflicts', filters],
    queryFn: () => apiFetch<Paginated<ConflictView>>(`/api/v1/conflicts?${buildConflictQs(filters)}`),
  });
}

export function useConflict(id: string | null) {
  return useQuery<ConflictView, Error>({
    queryKey: ['conflict', id],
    queryFn: () => apiFetch<ConflictView>(`/api/v1/conflicts/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useAcknowledgeConflict() {
  const queryClient = useQueryClient();
  return useMutation<ConflictView, Error, string>({
    mutationFn: (id) =>
      apiFetch<ConflictView>(`/api/v1/conflicts/${encodeURIComponent(id)}/acknowledge`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
    },
  });
}

function buildConflictQs(filters: ConflictFilters): string {
  const params = new URLSearchParams();
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.rule) params.set('rule', filters.rule);
  if (filters.project_id) params.set('project_id', filters.project_id);
  if (filters.status) params.set('status', filters.status);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  return params.toString();
}
