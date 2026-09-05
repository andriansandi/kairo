import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Skill } from '@kairo/types';
import { apiFetch } from './client';

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
