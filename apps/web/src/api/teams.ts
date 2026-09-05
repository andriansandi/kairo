import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Team, TeamType } from '@kairo/types';
import { apiFetch } from './client';

export type TeamWithMembers = Team & {
  member_ids: string[];
};

export type CreateTeamBody = {
  name: string;
  type: TeamType;
};

export type UpdateTeamBody = Partial<CreateTeamBody>;

export function useTeams() {
  return useQuery<TeamWithMembers[], Error>({
    queryKey: ['teams'],
    queryFn: () => apiFetch<TeamWithMembers[]>('/api/v1/teams'),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation<Team, Error, CreateTeamBody>({
    mutationFn: (body) =>
      apiFetch<Team>('/api/v1/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation<Team, Error, { teamId: string; body: UpdateTeamBody }>({
    mutationFn: ({ teamId, body }) =>
      apiFetch<Team>(`/api/v1/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { teamId: string; personId: string }>({
    mutationFn: ({ teamId, personId }) =>
      apiFetch(`/api/v1/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { teamId: string; personId: string }>({
    mutationFn: ({ teamId, personId }) =>
      apiFetch(`/api/v1/teams/${teamId}/members/${personId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });
}
