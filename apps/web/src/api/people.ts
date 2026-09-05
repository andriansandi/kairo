import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Allocation,
  Paginated,
  Person,
  PersonSkill,
  PersonSkillSource,
  PtoEntry,
  Team,
} from '@kairo/types';
import { apiFetch } from './client';

export type PersonWithRefs = Person & {
  role_name: string;
  team_ids: string[];
};

export type PersonDetail = {
  person: Person;
  skills: PersonSkill[];
  allocations: Allocation[];
  teams: Team[];
  pto: PtoEntry[];
};

export type PeopleFilters = {
  limit?: number;
  cursor?: string | null;
  q?: string;
  active?: boolean;
};

export type CreatePersonBody = {
  name: string;
  email: string;
  role_id: string;
  seniority?: number;
  hours_per_day?: number;
  overhead_pct?: number;
  active?: boolean;
};

export type UpdatePersonBody = Partial<CreatePersonBody>;

export type PersonSkillInput = {
  skill_id: string;
  level: 1 | 2 | 3 | 4;
  source?: PersonSkillSource;
};

export type PtoBody = {
  start_date: string;
  end_date: string;
  type?: PtoEntry['type'];
};

function peopleQueryString(filters: PeopleFilters): string {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.q) params.set('q', filters.q);
  if (filters.active !== undefined) params.set('active', String(filters.active));
  return params.toString();
}

export function usePeople(filters: PeopleFilters = {}) {
  return useQuery<Paginated<PersonWithRefs>, Error>({
    queryKey: ['people', filters],
    queryFn: () =>
      apiFetch<Paginated<PersonWithRefs>>(
        `/api/v1/people?${peopleQueryString(filters)}`,
      ),
  });
}

export function usePerson(id: string | null) {
  return useQuery<PersonDetail, Error>({
    queryKey: ['person', id],
    queryFn: () => apiFetch<PersonDetail>(`/api/v1/people/${id}`),
    enabled: !!id,
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation<Person, Error, CreatePersonBody>({
    mutationFn: (body) =>
      apiFetch<Person>('/api/v1/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation<Person, Error, { personId: string; body: UpdatePersonBody }>({
    mutationFn: ({ personId, body }) =>
      apiFetch<Person>(`/api/v1/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}

export function useUpdatePersonSkills() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { personId: string; skills: PersonSkillInput[] }>({
    mutationFn: ({ personId, skills }) =>
      apiFetch(`/api/v1/people/${personId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills }),
      }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}

export function useAddPto() {
  const queryClient = useQueryClient();
  return useMutation<PtoEntry, Error, { personId: string; body: PtoBody }>({
    mutationFn: ({ personId, body }) =>
      apiFetch<PtoEntry>(`/api/v1/people/${personId}/pto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}

export function useRemovePto() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { personId: string; ptoId: string }>({
    mutationFn: ({ personId, ptoId }) =>
      apiFetch(`/api/v1/people/${personId}/pto/${ptoId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}
