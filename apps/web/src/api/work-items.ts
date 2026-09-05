import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JrSkillRequirement, ProficiencyLevel, SkillWeight, WorkItem } from '@kairo/types';
import { apiFetch } from './client';

export type SkillRequirementInput = {
  skill_id: string;
  min_level: ProficiencyLevel;
  weight: SkillWeight;
};

export type WorkItemWithProject = WorkItem & { project_name: string };

export type WorkItemFilters = {
  project_id?: string;
  status?: string;
  q?: string;
  limit?: number;
  cursor?: string;
};

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function useWorkItems(filters: WorkItemFilters = {}) {
  return useQuery<{ items: WorkItemWithProject[]; nextCursor: string | null }, Error>({
    queryKey: ['work-items', filters],
    queryFn: () => apiFetch(`/api/v1/work-items${buildQueryString(filters)}`),
  });
}

export function useWorkItem(id: string | null) {
  return useQuery<WorkItem, Error>({
    queryKey: ['work-item', id],
    queryFn: () => apiFetch(`/api/v1/work-items/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
  });
}

export function useUpdateSkillRequirements(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ requirements: JrSkillRequirement[] }, Error, SkillRequirementInput[]>({
    mutationFn: (requirements) =>
      apiFetch<{ requirements: JrSkillRequirement[] }>(`/api/v1/work-items/${encodeURIComponent(workItemId)}/skill-requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['work-item', workItemId] });
    },
  });
}
