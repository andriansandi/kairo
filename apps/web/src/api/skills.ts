import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Skill } from '@kairo/types';
import { ApiError, apiFetch } from './client';

async function apiDelete(path: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'DELETE' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError(message, { status: 0, code: 'network_error' });
  }

  if (!res.ok) {
    let body: { error?: { code: string; message?: string; details?: unknown } } | undefined;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(body?.error?.message ?? res.statusText, {
      status: res.status,
      code: body?.error?.code ?? 'api_error',
      details: body?.error?.details,
    });
  }
}

export function useSkills(q = '') {
  return useQuery<Skill[], Error>({
    queryKey: ['skills', q],
    queryFn: () => apiFetch<Skill[]>(`/api/v1/skills?q=${encodeURIComponent(q)}`),
  });
}

export type CreateSkillBody = {
  name: string;
  category: string;
  aliases?: string[];
};

export type UpdateSkillBody = Partial<CreateSkillBody>;

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation<Skill, Error, CreateSkillBody>({
    mutationFn: (body) =>
      apiFetch<Skill>('/api/v1/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation<Skill, Error, { skillId: string; body: UpdateSkillBody }>({
    mutationFn: ({ skillId, body }) =>
      apiFetch<Skill>(`/api/v1/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (skillId) => apiDelete(`/api/v1/skills/${skillId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}
