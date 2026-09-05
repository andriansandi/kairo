import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@kairo/types';
import { apiFetch } from './client';

export function useHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/api/v1/healthz'),
    refetchInterval: 10_000,
  });
}
