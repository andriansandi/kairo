import {
  Person,
  Allocation,
  PtoEntry,
  OrgCalendar,
  CapacityWeekEntry,
  IsoDate,
  WeekKey,
  Team,
  TeamMembership,
} from "@kairo/types";
export type { CapacityWeekEntry } from "@kairo/types";
import { weekStart, isoWeekKey, workingDaysBetween } from "@kairo/calendar";

const DAY_MS = 86_400_000;

export const MAX_UTILIZATION_SENTINEL = 99;

export interface CapacityInput {
  people: Person[];
  allocations: Allocation[];
  ptoEntries: PtoEntry[];
  calendar: OrgCalendar;
  horizon: { from: string; to: string };
}

interface LedgerRow extends CapacityWeekEntry {
  flags: string[];
}

export interface TeamWeekEntry {
  team_id: string;
  week_key: string;
  member_count: number;
  available_h: number;
  planned_h: number;
  utilization: number;
  flags: string[];
}

export interface ProjectWeekEntry {
  project_id: string;
  week_key: string;
  planned_h: number;
  person_count: number;
}

function parseDate(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): IsoDate {
  const year = String(d.getUTCFullYear()).padStart(4, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: IsoDate, n: number): IsoDate {
  const d = parseDate(date);
  d.setTime(d.getTime() + n * DAY_MS);
  return formatDate(d);
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function weeksInHorizon(
  from: IsoDate,
  to: IsoDate,
): { week_key: WeekKey; start: IsoDate; end: IsoDate }[] {
  const weeks: { week_key: WeekKey; start: IsoDate; end: IsoDate }[] = [];
  let monday = weekStart(from);
  while (monday <= to) {
    const sunday = addDays(monday, 6);
    weeks.push({ week_key: isoWeekKey(monday), start: monday, end: sunday });
    monday = addDays(monday, 7);
  }
  return weeks;
}

function groupAllocationsByPerson(
  allocations: Allocation[],
): Map<string, Allocation[]> {
  const map = new Map<string, Allocation[]>();
  for (const a of allocations) {
    const list = map.get(a.person_id) ?? [];
    list.push(a);
    map.set(a.person_id, list);
  }
  return map;
}

function groupPtoByPerson(ptoEntries: PtoEntry[]): Map<string, PtoEntry[]> {
  const map = new Map<string, PtoEntry[]>();
  for (const p of ptoEntries) {
    const list = map.get(p.person_id) ?? [];
    list.push(p);
    map.set(p.person_id, list);
  }
  return map;
}

export function buildCapacityLedger(input: CapacityInput): CapacityWeekEntry[] {
  const { people, allocations, ptoEntries, calendar, horizon } = input;
  const activePeople = people.filter((p) => p.active);
  const weeks = weeksInHorizon(horizon.from, horizon.to);
  const allocsByPerson = groupAllocationsByPerson(allocations);
  const ptoByPerson = groupPtoByPerson(ptoEntries);
  const rows: LedgerRow[] = [];

  for (const person of activePeople) {
    const personAllocs = allocsByPerson.get(person.id) ?? [];
    const personPto = ptoByPerson.get(person.id) ?? [];

    for (const week of weeks) {
      const clippedStart = week.start < horizon.from ? horizon.from : week.start;
      const clippedEnd = week.end > horizon.to ? horizon.to : week.end;
      if (clippedStart > clippedEnd) continue;

      const grossDays = workingDaysBetween(
        clippedStart,
        addDays(clippedEnd, 1),
        calendar,
      );
      const gross_h = round2(grossDays * person.hours_per_day);

      const ptoDays = personPto.reduce((sum, pto) => {
        const pStart = pto.dates[0] > clippedStart ? pto.dates[0] : clippedStart;
        const pEnd = pto.dates[1] < clippedEnd ? pto.dates[1] : clippedEnd;
        if (pStart > pEnd) return sum;
        return (
          sum + workingDaysBetween(pStart, addDays(pEnd, 1), calendar)
        );
      }, 0);
      const pto_h = round2(ptoDays * person.hours_per_day);

      const overhead_h = round2(gross_h * person.overhead_pct);
      const available_h = round2(gross_h - pto_h - overhead_h);

      const planned_h = round2(
        personAllocs.reduce((sum, a) => {
          if (a.start_date > clippedEnd || a.end_date < clippedStart) {
            return sum;
          }
          return sum + a.fte * gross_h;
        }, 0),
      );

      let utilization: number;
      if (available_h > 0) {
        utilization = round2(planned_h / available_h);
      } else if (planned_h > 0) {
        utilization = MAX_UTILIZATION_SENTINEL;
      } else {
        utilization = 0;
      }

      const flags: string[] = [];
      if (planned_h > available_h && available_h > 0) {
        flags.push("over_capacity");
      }
      if (available_h <= 0 && planned_h > 0) {
        flags.push("no_available_capacity");
      }

      rows.push({
        week_key: week.week_key,
        person_id: person.id,
        gross_h,
        pto_h,
        overhead_h,
        available_h,
        planned_h,
        utilization,
        flags,
      });
    }
  }

  return rows;
}

export function rollupTeamCapacity(input: {
  ledger: CapacityWeekEntry[];
  teams: Team[];
  memberships: TeamMembership[];
}): TeamWeekEntry[] {
  const teamMembers = new Map<string, Set<string>>();
  for (const m of input.memberships) {
    const set = teamMembers.get(m.team_id) ?? new Set<string>();
    set.add(m.person_id);
    teamMembers.set(m.team_id, set);
  }

  interface Acc {
    team_id: string;
    week_key: string;
    available_h: number;
    planned_h: number;
    members: Set<string>;
  }
  const groups = new Map<string, Acc>();

  for (const row of input.ledger as LedgerRow[]) {
    for (const [teamId, members] of teamMembers) {
      if (!members.has(row.person_id)) continue;
      const key = `${teamId}|${row.week_key}`;
      let acc = groups.get(key);
      if (!acc) {
        acc = {
          team_id: teamId,
          week_key: row.week_key,
          available_h: 0,
          planned_h: 0,
          members: new Set<string>(),
        };
        groups.set(key, acc);
      }
      acc.available_h += row.available_h;
      acc.planned_h += row.planned_h;
      acc.members.add(row.person_id);
    }
  }

  const result: TeamWeekEntry[] = [];
  for (const acc of groups.values()) {
    const available_h = round2(acc.available_h);
    const planned_h = round2(acc.planned_h);
    let utilization: number;
    if (available_h > 0) {
      utilization = round2(planned_h / available_h);
    } else if (planned_h > 0) {
      utilization = MAX_UTILIZATION_SENTINEL;
    } else {
      utilization = 0;
    }

    const flags: string[] = [];
    if (planned_h > available_h && available_h > 0) {
      flags.push("over_capacity");
    }
    if (available_h <= 0 && planned_h > 0) {
      flags.push("no_available_capacity");
    }

    result.push({
      team_id: acc.team_id,
      week_key: acc.week_key,
      member_count: acc.members.size,
      available_h,
      planned_h,
      utilization,
      flags,
    });
  }

  result.sort(
    (a, b) =>
      a.team_id.localeCompare(b.team_id) || a.week_key.localeCompare(b.week_key),
  );
  return result;
}

export function rollupProjectDemand(input: {
  allocations: Allocation[];
  people: Person[];
  calendar: OrgCalendar;
  horizon: { from: string; to: string };
}): ProjectWeekEntry[] {
  const { allocations, people, calendar, horizon } = input;
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const weeks = weeksInHorizon(horizon.from, horizon.to);
  interface Acc {
    project_id: string;
    week_key: string;
    planned_h: number;
    persons: Set<string>;
  }
  const groups = new Map<string, Acc>();

  for (const a of allocations) {
    const person = peopleMap.get(a.person_id);
    if (!person) continue;

    for (const week of weeks) {
      const clippedStart = week.start < horizon.from ? horizon.from : week.start;
      const clippedEnd = week.end > horizon.to ? horizon.to : week.end;
      if (clippedStart > clippedEnd) continue;
      if (a.start_date > clippedEnd || a.end_date < clippedStart) continue;

      const grossDays = workingDaysBetween(
        clippedStart,
        addDays(clippedEnd, 1),
        calendar,
      );
      const gross_h = round2(grossDays * person.hours_per_day);
      const contribution = round2(a.fte * gross_h);

      const key = `${a.project_id}|${week.week_key}`;
      let acc = groups.get(key);
      if (!acc) {
        acc = {
          project_id: a.project_id,
          week_key: week.week_key,
          planned_h: 0,
          persons: new Set<string>(),
        };
        groups.set(key, acc);
      }
      acc.planned_h += contribution;
      acc.persons.add(a.person_id);
    }
  }

  const result: ProjectWeekEntry[] = [];
  for (const acc of groups.values()) {
    result.push({
      project_id: acc.project_id,
      week_key: acc.week_key,
      planned_h: round2(acc.planned_h),
      person_count: acc.persons.size,
    });
  }

  result.sort(
    (a, b) =>
      a.project_id.localeCompare(b.project_id) ||
      a.week_key.localeCompare(b.week_key),
  );
  return result;
}
