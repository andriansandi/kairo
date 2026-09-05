import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectPhase } from '@kairo/types';
import { apiFetch } from './client';

export type ProjectWithCount = Project & {
  work_item_count: number;
  feasibility_verdict: string | null;
};

export type ProjectFilters = {
  q?: string;
  status?: string;
  limit?: number;
  cursor?: string;
};

export type ProjectDetailResponse = {
  project: Project;
  phases: ProjectPhase[];
  counts: Record<string, number>;
};

export type UpdateProjectInput = {
  priority?: number | null;
  deadline?: string | null;
  declared_start?: string | null;
  declared_end?: string | null;
};

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery<{ items: ProjectWithCount[]; nextCursor: string | null }, Error>({
    queryKey: ['projects', filters],
    queryFn: () => apiFetch(`/api/v1/projects${buildQueryString(filters)}`),
  });
}

export function useProject(id: string) {
  return useQuery<ProjectDetailResponse, Error>({
    queryKey: ['project', id],
    queryFn: () => apiFetch(`/api/v1/projects/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, { id: string; input: UpdateProjectInput }>({
    mutationFn: ({ id, input }) =>
      apiFetch(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
