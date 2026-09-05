import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export type SkillCoverage = {
  skill_id: string;
  skill_name: string;
  level_counts: [number, number, number, number];
  total_people: number;
  free_hours: number;
  spof: boolean;
};

export type CoverageResponse = {
  coverage: SkillCoverage[];
};

export function useCoverage() {
  return useQuery<CoverageResponse, Error>({
    queryKey: ['coverage'],
    queryFn: () => apiFetch<CoverageResponse>('/api/v1/skills/coverage'),
  });
}
