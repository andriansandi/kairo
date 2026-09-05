import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export type AnalysisOutput = {
  mode: 'deterministic' | 'ai';
  summary: string;
  details?: string[];
};

export type AnalysisItem = {
  id: string;
  kind: string;
  subject_type: string;
  subject_id: string;
  snapshot_id: string;
  output: AnalysisOutput;
  cited_fact_ids: string[];
  created_at: string;
};

export type AnalysesResponse = {
  items: AnalysisItem[];
};

export type AnalysesFilters = {
  subject_type?: string;
  subject_id?: string;
};

function buildAnalysesQs(filters: AnalysesFilters): string {
  const params = new URLSearchParams();
  if (filters.subject_type) params.set('subject_type', filters.subject_type);
  if (filters.subject_id) params.set('subject_id', filters.subject_id);
  return params.toString();
}

export function useAnalyses(filters: AnalysesFilters = {}) {
  return useQuery<AnalysesResponse, Error>({
    queryKey: ['analyses', filters],
    queryFn: () =>
      apiFetch<AnalysesResponse>(
        `/api/v1/analyses?${buildAnalysesQs(filters)}`,
      ),
  });
}

export type ExplainInput = {
  kind: 'explain';
  subject_type: string;
  subject_id: string;
};

export function useExplainAnalysis() {
  return useMutation<AnalysisItem, Error, ExplainInput>({
    mutationFn: (input) =>
      apiFetch<{ analysis: AnalysisItem }>('/api/v1/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((res) => res.analysis),
  });
}
