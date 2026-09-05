import { useQuery } from '@tanstack/react-query';
import type { CapacityWeekEntry as CapacityWeekEntryBase } from '@kairo/types';
import type { TeamWeekEntry, ProjectWeekEntry } from '@kairo/capacity-engine';
import { apiFetch } from './client';

export type CapacityPivot = 'people' | 'teams' | 'projects';

export type CapacityFilters = {
  from: string;
  to: string;
  team_id?: string;
  person_id?: string;
  project_id?: string;
};

type CapacitySnapshot = {
  id: string;
  created_at: string;
};

export type CapacityResponse<T> = {
  snapshot: CapacitySnapshot | null;
  entries: T[];
};

export type CapacityWeekEntry = CapacityWeekEntryBase & {
  flags?: string[];
};

export type { TeamWeekEntry, ProjectWeekEntry } from '@kairo/capacity-engine';

export function useCapacity<T>(pivot: CapacityPivot, filters: CapacityFilters) {
  return useQuery<CapacityResponse<T>, Error>({
    queryKey: ['capacity', pivot, filters],
    queryFn: () => apiFetch<CapacityResponse<T>>(`/api/v1/capacity?${buildCapacityQs(pivot, filters)}`),
  });
}

export function usePersonCapacity(personId: string | null, from: string, to: string) {
  return useQuery<CapacityResponse<CapacityWeekEntry>, Error>({
    queryKey: ['person-capacity', personId, from, to],
    queryFn: () =>
      apiFetch<CapacityResponse<CapacityWeekEntry>>(
        `/api/v1/people/${encodeURIComponent(personId!)}/capacity?from=${from}&to=${to}`,
      ),
    enabled: !!personId,
  });
}

export function useTeamCapacity(teamId: string | null, from: string, to: string) {
  return useQuery<CapacityResponse<TeamWeekEntry>, Error>({
    queryKey: ['team-capacity', teamId, from, to],
    queryFn: () =>
      apiFetch<CapacityResponse<TeamWeekEntry>>(
        `/api/v1/teams/${encodeURIComponent(teamId!)}/capacity?from=${from}&to=${to}`,
      ),
    enabled: !!teamId,
  });
}

function buildCapacityQs(pivot: CapacityPivot, filters: CapacityFilters): string {
  const params = new URLSearchParams();
  params.set('pivot', pivot);
  params.set('from', filters.from);
  params.set('to', filters.to);
  if (filters.team_id) params.set('team_id', filters.team_id);
  if (filters.person_id) params.set('person_id', filters.person_id);
  if (filters.project_id) params.set('project_id', filters.project_id);
  return params.toString();
}

export function startOfWeek(d: Date): Date {
  const date = utcDate(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

export function endOfWeek(d: Date): Date {
  const monday = startOfWeek(d);
  const date = utcDate(monday);
  date.setUTCDate(date.getUTCDate() + 6);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const date = utcDate(d);
  date.setUTCDate(date.getUTCDate() + n);
  return date;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function isoDate(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoWeekKey(d: Date): string {
  const tmp = utcDate(d);
  const day = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - day + 3);
  const year = tmp.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day));
  const weekNum =
    Math.floor((utcDate(d).getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export function parseWeekKey(key: string): Date {
  const [yearStr, weekStr] = key.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day));
  return addDays(firstMonday, (week - 1) * 7);
}

export function weekColumns(from: string, to: string): string[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const weeks: string[] = [];
  let current = utcDate(start);
  while (current <= end) {
    weeks.push(isoWeekKey(current));
    current = addWeeks(current, 1);
  }
  return [...new Set(weeks)];
}

export function shortWeekLabel(key: string): string {
  const [, week] = key.split('-W');
  return `W${week}`;
}

export function formatWeekRange(key: string): string {
  const start = parseWeekKey(key);
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startText = start.toLocaleDateString(undefined, opts);
  const endText = end.toLocaleDateString(undefined, opts);
  return `${key} (${startText} – ${endText})`;
}

function utcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function defaultCapacityRange(): { from: string; to: string } {
  const today = new Date();
  const from = isoDate(startOfWeek(addDays(today, -28)));
  const to = isoDate(endOfWeek(addWeeks(today, 12)));
  return { from, to };
}

export function personDetailRange(): { from: string; to: string } {
  const today = new Date();
  const from = isoDate(startOfWeek(today));
  const to = isoDate(endOfWeek(addWeeks(today, 15)));
  return { from, to };
}

export function dashboardTeamRange(): { from: string; to: string } {
  const today = new Date();
  const from = isoDate(startOfWeek(today));
  const to = isoDate(endOfWeek(addWeeks(today, 3)));
  return { from, to };
}

export function heatClass(value: number, hasFlag?: boolean): string {
  if (hasFlag || !isFinite(value) || value > 125) {
    return 'bg-red-100 text-red-900';
  }
  if (value <= 85) return 'bg-emerald-100 text-emerald-900';
  if (value <= 100) return 'bg-amber-100 text-amber-900';
  if (value <= 125) return 'bg-orange-100 text-orange-900';
  return 'bg-red-100 text-red-900';
}
