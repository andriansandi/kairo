import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@kairo/types';

export function useHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/healthz');
      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<HealthResponse>;
    },
    refetchInterval: 10_000,
  });
}
