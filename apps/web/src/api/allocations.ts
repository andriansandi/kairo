import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Allocation, AllocationStatus, Paginated, Project } from '@kairo/types';
import { apiFetch } from './client';

export type AllocationFilters = {
  person_id?: string;
  project_id?: string;
  from?: string;
  to?: string;
};

export type CreateAllocationBody = {
  person_id: string;
  project_id: string;
  phase_id?: string;
  fte: number;
  start_date: string;
  end_date: string;
  status?: AllocationStatus;
  source?: Allocation['source'];
};

export type UpdateAllocationBody = Partial<CreateAllocationBody>;

function allocationQueryString(filters: AllocationFilters): string {
  const params = new URLSearchParams();
  if (filters.person_id) params.set('person_id', filters.person_id);
  if (filters.project_id) params.set('project_id', filters.project_id);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params.toString();
}

export function useAllocations(filters: AllocationFilters = {}) {
  return useQuery<Paginated<Allocation>, Error>({
    queryKey: ['allocations', filters],
    queryFn: () =>
      apiFetch<Paginated<Allocation>>(
        `/api/v1/allocations?${allocationQueryString(filters)}`,
      ),
  });
}

export function useProjects(q = '') {
  return useQuery<Paginated<Project>, Error>({
    queryKey: ['projects'],
    queryFn: () =>
      apiFetch<Paginated<Project>>(
        `/api/v1/projects?q=${encodeURIComponent(q)}&limit=200`,
      ),
  });
}

export function useCreateAllocation() {
  const queryClient = useQueryClient();
  return useMutation<Allocation, Error, CreateAllocationBody>({
    mutationFn: (body) =>
      apiFetch<Allocation>('/api/v1/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, body) => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      if (body.person_id) {
        queryClient.invalidateQueries({ queryKey: ['person', body.person_id] });
      }
    },
  });
}

export function useUpdateAllocation() {
  const queryClient = useQueryClient();
  return useMutation<Allocation, Error, { allocationId: string; body: UpdateAllocationBody }>({
    mutationFn: ({ allocationId, body }) =>
      apiFetch<Allocation>(`/api/v1/allocations/${allocationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { body }) => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      if (body.person_id) {
        queryClient.invalidateQueries({ queryKey: ['person', body.person_id] });
      }
    },
  });
}

export function useDeleteAllocation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { allocationId: string; personId?: string }>({
    mutationFn: ({ allocationId }) =>
      apiFetch(`/api/v1/allocations/${allocationId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      if (personId) {
        queryClient.invalidateQueries({ queryKey: ['person', personId] });
      }
    },
  });
}
