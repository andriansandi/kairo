import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@kairo/types';
import { apiFetch } from './client';

export function useRoles() {
  return useQuery<Role[], Error>({
    queryKey: ['roles'],
    queryFn: () => apiFetch<Role[]>('/api/v1/roles'),
  });
}

export type CreateRoleBody = {
  name: string;
  seniority_ladder?: string[];
};

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, CreateRoleBody>({
    mutationFn: (body) =>
      apiFetch<Role>('/api/v1/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}
