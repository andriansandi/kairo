import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Person, SyncRun } from '@kairo/types';
import { apiFetch } from './client';

export type PlaneMember = {
  id: string;
  name: string;
  email: string;
};

export type SyncType = 'full' | 'incremental';

export type SyncRunResponse = {
  sync_run: SyncRun;
};

export type ResolveMappingAction =
  | { action: 'link'; person_id: string }
  | { action: 'create' };

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function useSyncRuns() {
  return useQuery<SyncRun[], Error>({
    queryKey: ['sync-runs'],
    queryFn: () => apiFetch('/api/v1/plane/sync-runs'),
  });
}

export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation<SyncRunResponse, Error, { type: SyncType }>({
    mutationFn: ({ type }) =>
      apiFetch('/api/v1/plane/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-runs'] });
    },
  });
}

export function useMappingQueue() {
  return useQuery<PlaneMember[], Error>({
    queryKey: ['mapping-queue'],
    queryFn: () => apiFetch('/api/v1/plane/mapping-queue'),
  });
}

export function useResolveMapping() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { memberId: string; action: ResolveMappingAction }>({
    mutationFn: ({ memberId, action }) =>
      apiFetch(`/api/v1/plane/mapping-queue/${encodeURIComponent(memberId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mapping-queue'] });
    },
  });
}

export function usePeople(q: string) {
  return useQuery<{ items: Person[]; nextCursor: string | null }, Error>({
    queryKey: ['people', q],
    queryFn: () => apiFetch(`/api/v1/people${buildQueryString({ q, limit: 50 })}`),
  });
}
