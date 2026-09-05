import { useQuery } from '@tanstack/react-query';
import type { JrSkillRequirement } from '@kairo/types';
import { apiFetch } from './client';

export type MatchComponents = {
  skill: number;
  availability: number;
  context: number;
  role: number;
};

export type MatchResultEntry = {
  person_id: string;
  person_name: string;
  score: number;
  components: MatchComponents;
  free_hours_in_window: number;
  existing_commitments: number;
  gaps: {
    skill_id: string;
    required_level: number;
    actual_level: number | null;
  }[];
  filtered: boolean;
  filter_reason?: string;
};

export type MatchesResponse = {
  results: MatchResultEntry[];
  requirements: JrSkillRequirement[];
};

export function useMatches(workItemId: string | null) {
  return useQuery<MatchesResponse, Error>({
    queryKey: ['matches', workItemId],
    queryFn: () =>
      apiFetch<MatchesResponse>(`/api/v1/work-items/${encodeURIComponent(workItemId!)}/matches`),
    enabled: Boolean(workItemId),
  });
}
