import { useMutation } from '@tanstack/react-query';
import { apiFetch } from './client';

export type AskMode = 'deterministic' | 'ai' | 'unavailable';

export type AskResponse = {
  answer: string;
  mode: AskMode;
  sources: string[];
};

export type AskBody = {
  question: string;
};

export function useAsk() {
  return useMutation<AskResponse, Error, AskBody>({
    mutationFn: (body) =>
      apiFetch<AskResponse>('/api/v1/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });
}
