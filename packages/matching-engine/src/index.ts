import {
  Person,
  PersonSkill,
  Allocation,
  Skill,
  CapacityWeekEntry,
} from "@kairo/types";
import { isoWeekKey } from "@kairo/calendar";

const DAY_MS = 86_400_000;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  const year = String(d.getUTCFullYear()).padStart(4, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setTime(d.getTime() + n * DAY_MS);
  return formatDate(d);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export const DEFAULT_MATCH_WEIGHTS = {
  skill: 0.45,
  availability: 0.35,
  context: 0.1,
  role: 0.1,
} as const;

export interface MatchRequest {
  workItem: {
    id: string;
    title: string;
    estimate_hours?: number;
    start_date?: string;
    due_date?: string;
    project_id?: string;
    expected_role_id?: string;
  };
  requirements: {
    skill_id: string;
    min_level: number;
    weight: "must" | "nice";
  }[];
  people: Person[];
  personSkills: PersonSkill[];
  allocations: Allocation[];
  ledger: CapacityWeekEntry[];
  now?: string;
}

export interface MatchComponents {
  skill: number;
  availability: number;
  context: number;
  role: number;
}

export interface MatchResultEntry {
  person_id: string;
  score: number;
  components: MatchComponents;
  free_hours_in_window: number;
  existing_commitments: number;
  gaps: { skill_id: string; required_level: number; actual_level: number | null }[];
  filtered: boolean;
  filter_reason?: string;
}

export interface SkillCoverage {
  skill_id: string;
  skill_name: string;
  level_counts: [number, number, number, number];
  total_people: number;
  free_hours: number;
  spof: boolean;
}

function buildSkillMap(personSkills: PersonSkill[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ps of personSkills) {
    const existing = map.get(ps.skill_id);
    if (existing === undefined || ps.level > existing) {
      map.set(ps.skill_id, ps.level);
    }
  }
  return map;
}

function windowWeekBoundaries(
  request: MatchRequest,
): { start: string; end: string; startWeek: string; endWeek: string } {
  const now = request.now ?? today();
  const start = request.workItem.start_date ?? now;
  const end = request.workItem.due_date ?? addDays(now, 56);
  return {
    start,
    end,
    startWeek: isoWeekKey(start),
    endWeek: isoWeekKey(end),
  };
}

function aggregateWindowHours(
  personId: string,
  ledger: CapacityWeekEntry[],
  startWeek: string,
  endWeek: string,
): { free: number; planned: number; rows: number } {
  let free = 0;
  let planned = 0;
  let rows = 0;
  for (const entry of ledger) {
    if (
      entry.person_id === personId &&
      entry.week_key >= startWeek &&
      entry.week_key <= endWeek
    ) {
      rows++;
      free += Math.max(0, entry.available_h - entry.planned_h);
      planned += entry.planned_h;
    }
  }
  return { free, planned, rows };
}

function computeSkill(
  requirements: MatchRequest["requirements"],
  personSkills: PersonSkill[],
): { score: number; gaps: MatchResultEntry["gaps"]; unmetMust: boolean } {
  const skillMap = buildSkillMap(personSkills);
  if (requirements.length === 0) {
    return { score: 0, gaps: [], unmetMust: false };
  }

  let weighted = 0;
  let weightSum = 0;
  const gaps: MatchResultEntry["gaps"] = [];
  let unmetMust = false;

  for (const req of requirements) {
    const actual = skillMap.get(req.skill_id) ?? null;
    const reqWeight = req.weight === "must" ? 2 : 1;
    if (actual === null) {
      gaps.push({
        skill_id: req.skill_id,
        required_level: req.min_level,
        actual_level: null,
      });
      if (req.weight === "must") unmetMust = true;
    } else if (actual < req.min_level) {
      gaps.push({
        skill_id: req.skill_id,
        required_level: req.min_level,
        actual_level: actual,
      });
      if (req.weight === "must") unmetMust = true;
    }

    if (actual !== null && actual >= req.min_level) {
      weighted += reqWeight * (1 + 0.25 * Math.min(actual - req.min_level, 1));
    } else {
      // nice-and-missing contributes 0; must-and-missing is gated.
      weighted += 0;
    }
    weightSum += reqWeight;
  }

  const score = clamp((weighted / weightSum) * 100, 0, 100);
  return { score, gaps, unmetMust };
}

function computeContext(
  person: Person,
  workItem: MatchRequest["workItem"],
  allocations: Allocation[],
  windowStart: string,
  windowEnd: string,
): number {
  if (!workItem.project_id) return 30;

  const projectId = workItem.project_id;
  const extendedStart = addDays(windowStart, -7);
  const extendedEnd = addDays(windowEnd, 7);

  let hasProjectAllocation = false;

  for (const alloc of allocations) {
    if (alloc.person_id !== person.id || alloc.project_id !== projectId) {
      continue;
    }
    hasProjectAllocation = true;
    const overlapOrAdjacent =
      alloc.start_date <= extendedEnd && alloc.end_date >= extendedStart;
    if (overlapOrAdjacent) {
      return 100;
    }
  }

  return hasProjectAllocation ? 50 : 30;
}

function computeRole(
  person: Person,
  expectedRoleId: string | undefined,
): number {
  if (!expectedRoleId) return 50;
  return person.role_id === expectedRoleId ? 100 : 50;
}

export function matchWorkItem(request: MatchRequest): MatchResultEntry[] {
  const { start, end, startWeek, endWeek } = windowWeekBoundaries(request);
  const estimate = Math.max(0, request.workItem.estimate_hours ?? 40);
  const results: MatchResultEntry[] = [];

  for (const person of request.people) {
    const { free, planned, rows } = aggregateWindowHours(
      person.id,
      request.ledger,
      startWeek,
      endWeek,
    );

    const { score: skillScore, gaps, unmetMust } = computeSkill(
      request.requirements,
      request.personSkills.filter((ps) => ps.person_id === person.id),
    );

    const availability = estimate <= 0 ? 100 : clamp((free / estimate) * 100, 0, 100);
    const context = computeContext(
      person,
      request.workItem,
      request.allocations,
      start,
      end,
    );
    const role = computeRole(person, request.workItem.expected_role_id);

    const components: MatchComponents = {
      skill: round1(skillScore),
      availability: round1(availability),
      context,
      role,
    };

    const score = round1(
      DEFAULT_MATCH_WEIGHTS.skill * components.skill +
        DEFAULT_MATCH_WEIGHTS.availability * components.availability +
        DEFAULT_MATCH_WEIGHTS.context * components.context +
        DEFAULT_MATCH_WEIGHTS.role * components.role,
    );

    let filtered = false;
    let filterReason: string | undefined;

    if (unmetMust) {
      filtered = true;
      const names = gaps
        .filter((g) => g.actual_level === null || g.actual_level < g.required_level)
        .map((g) => g.skill_id)
        .join(", ");
      filterReason = `Missing must-have skill(s): ${names}`;
    } else if (estimate > 0 && free === 0) {
      filtered = true;
      filterReason = rows === 0 ? "No capacity data in window" : "No free capacity in window";
    }

    results.push({
      person_id: person.id,
      score,
      components,
      free_hours_in_window: free,
      existing_commitments: planned,
      gaps,
      filtered,
      filter_reason: filterReason,
    });
  }

  results.sort((a, b) => {
    if (a.filtered !== b.filtered) return a.filtered ? 1 : -1;
    return b.score - a.score;
  });

  return results;
}

export function computeSkillCoverage(input: {
  skills: Skill[];
  people: Person[];
  personSkills: PersonSkill[];
  ledger: CapacityWeekEntry[];
}): SkillCoverage[] {
  const peopleBySkill = new Map<string, Map<string, number>>();

  for (const ps of input.personSkills) {
    let map = peopleBySkill.get(ps.skill_id);
    if (!map) {
      map = new Map<string, number>();
      peopleBySkill.set(ps.skill_id, map);
    }
    const existing = map.get(ps.person_id);
    if (existing === undefined || ps.level > existing) {
      map.set(ps.person_id, ps.level);
    }
  }

  const freeByPerson = new Map<string, number>();
  for (const entry of input.ledger) {
    const add = Math.max(0, entry.available_h - entry.planned_h);
    freeByPerson.set(
      entry.person_id,
      (freeByPerson.get(entry.person_id) ?? 0) + add,
    );
  }

  return input.skills
    .map((skill) => {
      const people = peopleBySkill.get(skill.id) ?? new Map<string, number>();
      const counts: [number, number, number, number] = [0, 0, 0, 0];
      let level3Plus = 0;
      let freeHours = 0;

      for (const [personId, level] of people.entries()) {
        const idx = clamp(level - 1, 0, 3);
        counts[idx]++;
        if (level >= 3) level3Plus++;
        freeHours += freeByPerson.get(personId) ?? 0;
      }

      return {
        skill_id: skill.id,
        skill_name: skill.name,
        level_counts: counts,
        total_people: people.size,
        free_hours: freeHours,
        spof: level3Plus === 1,
      };
    })
    .sort((a, b) => a.skill_name.localeCompare(b.skill_name));
}
