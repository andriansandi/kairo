import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, Person, Project, TimelineImport } from '@kairo/types';
import { apiFetch } from './client';
import type { RowValidationError, RowValidationWarning, TimelineImportRow } from '../components/import-wizard/parse';

export interface ImportCounts {
  total?: number;
  valid?: number;
  errors?: number;
  warnings?: number;
  [key: string]: number | undefined;
}

export interface ImportSubmissionResult {
  import: TimelineImport;
  counts: ImportCounts;
  errors: RowValidationError[];
  warnings: RowValidationWarning[];
}

export interface ImportDetailResponse {
  import: TimelineImport;
  rows: TimelineImportRow[];
}

export interface ProjectMapping {
  key: string;
  action: 'link' | 'create';
  project_id?: string;
  code?: string;
  name?: string;
}

export interface PersonMapping {
  key: string;
  action: 'link' | 'create' | 'skip';
  person_id?: string;
  name?: string;
  email?: string;
  role_id?: string;
}

export interface ConfirmImportBody {
  project_mappings: ProjectMapping[];
  person_mappings: PersonMapping[];
}

export interface ConfirmImportResult {
  projects_linked: number;
  projects_created: number;
  phases_created: number;
  allocations_created: number;
  rows_skipped: number;
}

export function useImports() {
  return useQuery<TimelineImport[], Error>({
    queryKey: ['imports'],
    queryFn: () => apiFetch<TimelineImport[]>('/api/v1/imports'),
  });
}

export function useImport(id: string | undefined) {
  return useQuery<ImportDetailResponse, Error>({
    queryKey: ['import', id],
    queryFn: () => apiFetch<ImportDetailResponse>(`/api/v1/imports/${id}`),
    enabled: !!id,
  });
}

export function useProjectsForImport(q: string) {
  return useQuery<Paginated<Project>, Error>({
    queryKey: ['projects', q],
    queryFn: () => apiFetch<Paginated<Project>>(`/api/v1/projects?q=${encodeURIComponent(q)}&limit=50`),
  });
}

export function usePeopleForImport(q: string) {
  return useQuery<Paginated<Person>, Error>({
    queryKey: ['people', q],
    queryFn: () => apiFetch<Paginated<Person>>(`/api/v1/people?q=${encodeURIComponent(q)}&limit=50`),
  });
}

export function useCreateImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportSubmissionResult, Error, FormData>({
    mutationFn: (formData) =>
      apiFetch<ImportSubmissionResult>('/api/v1/imports', {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}

export function useDeleteImport() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/imports/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}

export function useConfirmImport() {
  const queryClient = useQueryClient();
  return useMutation<ConfirmImportResult, Error, { id: string; body: ConfirmImportBody }>({
    mutationFn: ({ id, body }) =>
      apiFetch<ConfirmImportResult>(`/api/v1/imports/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}
