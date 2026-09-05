import {
  Person,
  Team,
  Project,
  ProjectPhase,
  Allocation,
  OrgCalendar,
  IsoDate,
  WeekKey,
} from "@kairo/types";
import {
  CapacityWeekEntry,
  TeamWeekEntry,
  MAX_UTILIZATION_SENTINEL,
} from "@kairo/capacity-engine";
import { weekStart, isoWeekKey, workingDaysBetween } from "@kairo/calendar";

const DAY_MS = 86_400_000;

export type EngineSeverity = "warning" | "at_risk" | "critical";

export interface ConflictThresholds {
  personAtRisk: number;
  personCritical: number;
  teamAtRisk: number;
  teamCritical: number;
  sustainedWeeks: number;
  deadlineCriticalDays: number;
}

export const DEFAULT_CONFLICT_THRESHOLDS: ConflictThresholds = {
  personAtRisk: 1.0,
  personCritical: 1.25,
  teamAtRisk: 1.0,
  teamCritical: 1.25,
  sustainedWeeks: 2,
  deadlineCriticalDays: 10,
};

export interface EngineConflict {
  rule: "C1" | "C2" | "C4" | "C10";
  severity: EngineSeverity;
  person_id?: string;
  team_id?: string;
  project_id?: string;
  phase_id?: string;
  window_start: string;
  window_end: string;
  metrics: Record<string, number | string>;
  explanation: string;
}

export interface ConflictEngineInput {
  ledger: CapacityWeekEntry[];
  teamWeeks: TeamWeekEntry[];
  people: Person[];
  teams: Team[];
  projects: Project[];
  phases: ProjectPhase[];
  allocations: Allocation[];
  calendar: OrgCalendar;
  horizon: { from: string; to: string };
  config?: ConflictThresholds;
}

interface WeekRange {
  week_key: WeekKey;
  start: IsoDate;
  end: IsoDate;
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

function weeksInHorizon(from: IsoDate, to: IsoDate): WeekRange[] {
  const weeks: WeekRange[] = [];
  let monday = weekStart(from);
  while (monday <= to) {
    weeks.push({
      week_key: isoWeekKey(monday),
      start: monday,
      end: addDays(monday, 6),
    });
    monday = addDays(monday, 7);
  }
  return weeks;
}

function formatUtilization(util: number): string {
  if (util === MAX_UTILIZATION_SENTINEL) return "∞";
  return `${Math.round(round2(util) * 100)}%`;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function severityRank(s: EngineSeverity): number {
  return s === "critical" ? 0 : s === "at_risk" ? 1 : 2;
}

function compareConflicts(a: EngineConflict, b: EngineConflict): number {
  const sev = severityRank(a.severity) - severityRank(b.severity);
  if (sev !== 0) return sev;
  const rule = a.rule.localeCompare(b.rule);
  if (rule !== 0) return rule;
  const idA = a.person_id ?? a.team_id ?? a.project_id ?? a.phase_id ?? "";
  const idB = b.person_id ?? b.team_id ?? b.project_id ?? b.phase_id ?? "";
  return idA.localeCompare(idB);
}

function escalate(severity: EngineSeverity, sustained: boolean): EngineSeverity {
  if (!sustained) return severity;
  if (severity === "warning") return "at_risk";
  return "critical";
}

function buildWeekMap(
  horizon: ConflictEngineInput["horizon"],
): Map<WeekKey, WeekRange> {
  return new Map(
    weeksInHorizon(horizon.from, horizon.to).map((w) => [w.week_key, w]),
  );
}

function evaluateC1(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const weekMap = buildWeekMap(input.horizon);

  const rowsByPerson = new Map<string, CapacityWeekEntry[]>();
  for (const row of input.ledger) {
    const list = rowsByPerson.get(row.person_id) ?? [];
    list.push(row);
    rowsByPerson.set(row.person_id, list);
  }

  for (const [personId, rows] of rowsByPerson) {
    const person = peopleById.get(personId);
    if (!person) continue;

    rows.sort((a, b) => a.week_key.localeCompare(b.week_key));
    let run: CapacityWeekEntry[] = [];

    const flushRun = () => {
      if (run.length === 0) return;
      let worst = run[0];
      for (const r of run) {
        if (r.utilization > worst.utilization) worst = r;
      }
      const maxUtil = worst.utilization;
      const over_h = round2(worst.planned_h - worst.available_h);
      const over_days = round2(over_h / person.hours_per_day);

      let base: EngineSeverity;
      if (maxUtil > cfg.personCritical) {
        base = "critical";
      } else {
        base = "at_risk";
      }
      const severity = escalate(base, run.length >= cfg.sustainedWeeks);

      const fteParts: string[] = [];
      const weekRange = weekMap.get(worst.week_key);
      if (weekRange) {
        const byProject = new Map<string, number>();
        for (const a of input.allocations) {
          if (a.person_id !== personId) continue;
          if (
            a.start_date > weekRange.end ||
            a.end_date < weekRange.start
          ) {
            continue;
          }
          byProject.set(a.project_id, (byProject.get(a.project_id) ?? 0) + a.fte);
        }
        for (const [pid, fte] of byProject) {
          const name = projectsById.get(pid)?.name ?? pid;
          fteParts.push(`${name} ${Math.round(fte * 100)}%`);
        }
      }

      const fteText = fteParts.length ? ` (${fteParts.join(" + ")})` : "";
      const explanation =
        `${person.name} is allocated ${formatUtilization(maxUtil)} in weeks ${run[0].week_key}–${run[run.length - 1].week_key}.${fteText} ` +
        `Planned ${fmt(worst.planned_h)}h vs available ${fmt(worst.available_h)}h after ${fmt(worst.pto_h)}h PTO and ${Math.round(person.overhead_pct * 100)}% overhead — a shortfall of ${fmt(over_h)}h (${fmt(over_days)} working days).`;

      conflicts.push({
        rule: "C1",
        severity,
        person_id: personId,
        window_start: run[0].week_key,
        window_end: run[run.length - 1].week_key,
        metrics: {
          max_utilization: maxUtil,
          weeks: run.length,
          planned_h: worst.planned_h,
          available_h: worst.available_h,
          over_h: over_h,
          over_days: over_days,
        },
        explanation,
      });
      run = [];
    };

    for (const row of rows) {
      if (row.utilization > 1) {
        run.push(row);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return conflicts;
}

function evaluateC2(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const teamsById = new Map(input.teams.map((t) => [t.id, t]));

  const rowsByTeam = new Map<string, TeamWeekEntry[]>();
  for (const row of input.teamWeeks) {
    const list = rowsByTeam.get(row.team_id) ?? [];
    list.push(row);
    rowsByTeam.set(row.team_id, list);
  }

  for (const [teamId, rows] of rowsByTeam) {
    const team = teamsById.get(teamId);
    if (!team) continue;

    rows.sort((a, b) => a.week_key.localeCompare(b.week_key));
    let run: TeamWeekEntry[] = [];

    const flushRun = () => {
      if (run.length === 0) return;
      let worst = run[0];
      for (const r of run) {
        if (r.utilization > worst.utilization) worst = r;
      }
      const maxUtil = worst.utilization;
      const over_h = round2(worst.planned_h - worst.available_h);

      let base: EngineSeverity;
      if (maxUtil > cfg.teamCritical) {
        base = "critical";
      } else {
        base = "at_risk";
      }
      const severity = escalate(base, run.length >= cfg.sustainedWeeks);

      const explanation =
        `${team.name} is over demand (${formatUtilization(maxUtil)}) in weeks ${run[0].week_key}–${run[run.length - 1].week_key}. ` +
        `Planned ${fmt(worst.planned_h)}h vs available ${fmt(worst.available_h)}h — over by ${fmt(over_h)}h.`;

      conflicts.push({
        rule: "C2",
        severity,
        team_id: teamId,
        window_start: run[0].week_key,
        window_end: run[run.length - 1].week_key,
        metrics: {
          max_utilization: maxUtil,
          weeks: run.length,
          planned_h: worst.planned_h,
          available_h: worst.available_h,
          over_h: over_h,
        },
        explanation,
      });
      run = [];
    };

    for (const row of rows) {
      if (row.utilization > 1) {
        run.push(row);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return conflicts;
}

function evaluateC4(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));

  for (const project of input.projects) {
    if (!project.deadline) continue;
    const phases = input.phases.filter((ph) => ph.project_id === project.id);
    const latestPhaseEnd = phases
      .map((ph) => ph.declared_end)
      .filter((d): d is IsoDate => !!d)
      .sort()[phases.length - 1];

    const declaredEnd = project.declared_end ?? project.deadline;
    const finish = latestPhaseEnd && latestPhaseEnd > declaredEnd
      ? latestPhaseEnd
      : declaredEnd;

    if (finish <= project.deadline) continue;

    const overshootDays = workingDaysBetween(
      addDays(project.deadline, 1),
      addDays(finish, 1),
      input.calendar,
    );
    const severity: EngineSeverity =
      overshootDays > cfg.deadlineCriticalDays ? "critical" : "at_risk";

    conflicts.push({
      rule: "C4",
      severity,
      project_id: project.id,
      window_start: project.deadline,
      window_end: finish,
      metrics: {
        overshoot_days: overshootDays,
        deadline: project.deadline,
        finish,
      },
      explanation:
        `Project ${project.name} (deadline ${project.deadline}) finishes ${finish} — overshoot ${overshootDays} working day(s).`,
    });
  }

  return conflicts;
}

function evaluateC10(input: ConflictEngineInput): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));

  for (const phase of input.phases) {
    const overlapsHorizon =
      phase.declared_start <= input.horizon.to &&
      phase.declared_end >= input.horizon.from;
    if (!overlapsHorizon) continue;

    const staffed = input.allocations.some((a) => a.phase_id === phase.id);
    if (staffed) continue;

    const project = projectsById.get(phase.project_id);
    conflicts.push({
      rule: "C10",
      severity: "warning",
      project_id: phase.project_id,
      phase_id: phase.id,
      window_start: phase.declared_start,
      window_end: phase.declared_end,
      metrics: {
        phase_start: phase.declared_start,
        phase_end: phase.declared_end,
        project_id: phase.project_id,
      },
      explanation:
        `Phase ${phase.name} (${phase.declared_start} to ${phase.declared_end}) in project ${project?.name ?? phase.project_id} has no resource allocation.`,
    });
  }

  return conflicts;
}

export function evaluateConflicts(
  input: ConflictEngineInput,
): EngineConflict[] {
  const cfg = input.config ?? DEFAULT_CONFLICT_THRESHOLDS;
  const conflicts: EngineConflict[] = [
    ...evaluateC1(input, cfg),
    ...evaluateC2(input, cfg),
    ...evaluateC4(input, cfg),
    ...evaluateC10(input),
  ];
  conflicts.sort(compareConflicts);
  return conflicts;
}
