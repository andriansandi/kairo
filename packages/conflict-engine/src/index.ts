import {
  Person,
  Team,
  Project,
  ProjectPhase,
  Allocation,
  OrgCalendar,
  IsoDate,
  WeekKey,
  Skill,
  PersonSkill,
  JrSkillRequirement,
  WorkItem,
  Dependency,
  TeamMembership,
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
  spofFteThreshold: number;
  personBufferPct: number;
}

export const DEFAULT_CONFLICT_THRESHOLDS: ConflictThresholds = {
  personAtRisk: 1.0,
  personCritical: 1.25,
  teamAtRisk: 1.0,
  teamCritical: 1.25,
  sustainedWeeks: 2,
  deadlineCriticalDays: 10,
  spofFteThreshold: 0.5,
  personBufferPct: 0.15,
};

export interface EngineConflict {
  rule:
    | "C1"
    | "C2"
    | "C3"
    | "C4"
    | "C5"
    | "C6"
    | "C7"
    | "C8"
    | "C9"
    | "C10";
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

export interface FeasibilitySummary {
  project_id: string;
  slack_days: number | null;
  buffer_days: number;
  verdict: string;
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
  skills?: Skill[];
  personSkills?: PersonSkill[];
  jrSkillRequirements?: JrSkillRequirement[];
  workItems?: WorkItem[];
  feasibilityResults?: FeasibilitySummary[];
  dependencies?: Dependency[];
  teamMemberships?: TeamMembership[];
  now?: IsoDate | Date;
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

function dateOverlap(
  aStart: IsoDate,
  aEnd: IsoDate,
  bStart: IsoDate,
  bEnd: IsoDate,
): { start: IsoDate; end: IsoDate } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start > end) return null;
  return { start, end };
}

function normalizeNow(now?: IsoDate | Date): Date {
  if (!now) return new Date();
  return typeof now === "string" ? parseDate(now) : now;
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

function evaluateC3(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const teamsById = new Map(input.teams.map((t) => [t.id, t]));
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const memberships = input.teamMemberships ?? [];

  const teamMembers = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = teamMembers.get(m.team_id) ?? new Set<string>();
    set.add(m.person_id);
    teamMembers.set(m.team_id, set);
  }

  const ledgerByPerson = new Map<string, Map<WeekKey, CapacityWeekEntry>>();
  for (const row of input.ledger) {
    const weekMap = ledgerByPerson.get(row.person_id) ?? new Map<WeekKey, CapacityWeekEntry>();
    weekMap.set(row.week_key, row);
    ledgerByPerson.set(row.person_id, weekMap);
  }

  const allocByPerson = new Map<string, Allocation[]>();
  for (const a of input.allocations) {
    const list = allocByPerson.get(a.person_id) ?? [];
    list.push(a);
    allocByPerson.set(a.person_id, list);
  }

  const weeks = weeksInHorizon(input.horizon.from, input.horizon.to);

  for (const team of input.teams.filter((t) => t.type === "devops")) {
    const members = teamMembers.get(team.id) ?? new Set<string>();
    if (members.size === 0) continue;

    interface WeekData {
      week_key: WeekKey;
      start: IsoDate;
      end: IsoDate;
      available_h: number;
      demand_h: number;
      projectIds: string[];
      projectDemand: Map<string, number>;
    }

    const weeksData: WeekData[] = [];
    for (const w of weeks) {
      let available_h = 0;
      let demand_h = 0;
      for (const personId of members) {
        const row = ledgerByPerson.get(personId)?.get(w.week_key);
        if (!row) continue;
        available_h += row.available_h;
        demand_h += row.planned_h;
      }

      const projectDemand = new Map<string, number>();
      const projectSet = new Set<string>();
      for (const personId of members) {
        const row = ledgerByPerson.get(personId)?.get(w.week_key);
        if (!row) continue;
        for (const a of allocByPerson.get(personId) ?? []) {
          if (a.start_date > w.end || a.end_date < w.start) continue;
          projectSet.add(a.project_id);
          const contribution = round2(a.fte * row.gross_h);
          projectDemand.set(
            a.project_id,
            (projectDemand.get(a.project_id) ?? 0) + contribution,
          );
        }
      }

      weeksData.push({
        week_key: w.week_key,
        start: w.start,
        end: w.end,
        available_h: round2(available_h),
        demand_h: round2(demand_h),
        projectIds: Array.from(projectSet),
        projectDemand,
      });
    }

    let run: WeekData[] = [];
    const flushRun = () => {
      if (run.length === 0) return;
      const worst = run.reduce((acc, r) => {
        const accUtil =
          acc.available_h > 0
            ? acc.demand_h / acc.available_h
            : acc.demand_h > 0
              ? MAX_UTILIZATION_SENTINEL
              : 0;
        const rUtil =
          r.available_h > 0
            ? r.demand_h / r.available_h
            : r.demand_h > 0
              ? MAX_UTILIZATION_SENTINEL
              : 0;
        return rUtil > accUtil ? r : acc;
      });

      const maxUtil =
        worst.available_h > 0
          ? round2(worst.demand_h / worst.available_h)
          : worst.demand_h > 0
            ? MAX_UTILIZATION_SENTINEL
            : 0;
      const base: EngineSeverity =
        maxUtil > cfg.teamCritical ? "critical" : "at_risk";
      const severity = escalate(base, run.length >= cfg.sustainedWeeks);

      const demand_h = worst.demand_h;
      const available_h = worst.available_h;
      const project_count = worst.projectIds.length;

      const shareParts: string[] = [];
      const sortedProjects = [...worst.projectDemand.entries()].sort(
        (a, b) => a[0].localeCompare(b[0]),
      );
      for (const [projectId, share] of sortedProjects) {
        if (share === 0) continue;
        const pct = demand_h > 0 ? Math.round((share / demand_h) * 100) : 0;
        const name = projectsById.get(projectId)?.name ?? projectId;
        shareParts.push(`${name} ${fmt(share)}h (${pct}%)`);
      }

      const explanation =
        `${team.name} (DevOps) is over-committed (${formatUtilization(maxUtil)}) in weeks ${run[0].week_key}–${run[run.length - 1].week_key} across ${project_count} projects. ` +
        `Competing demand: ${shareParts.join(", ")}. Demand ${fmt(demand_h)}h vs available ${fmt(available_h)}h.`;

      conflicts.push({
        rule: "C3",
        severity,
        team_id: team.id,
        window_start: run[0].week_key,
        window_end: run[run.length - 1].week_key,
        metrics: {
          max_utilization: maxUtil,
          weeks: run.length,
          demand_h,
          available_h,
          project_count,
        },
        explanation,
      });
      run = [];
    };

    for (const w of weeksData) {
      const util =
        w.available_h > 0
          ? w.demand_h / w.available_h
          : w.demand_h > 0
            ? MAX_UTILIZATION_SENTINEL
            : 0;
      if (util > 1 && w.projectIds.length >= 2) {
        run.push(w);
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
    const finish =
      latestPhaseEnd && latestPhaseEnd > declaredEnd
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

function evaluateC5(input: ConflictEngineInput): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const dependencies = input.dependencies ?? [];

  const projectDepPairs = new Set<string>();
  for (const d of dependencies) {
    if (d.from_project_id && d.to_project_id && !d.from_phase_id && !d.to_phase_id) {
      const key = [d.from_project_id, d.to_project_id].sort().join("|");
      projectDepPairs.add(key);
    }
  }

  const byPerson = new Map<string, Allocation[]>();
  for (const a of input.allocations) {
    const list = byPerson.get(a.person_id) ?? [];
    list.push(a);
    byPerson.set(a.person_id, list);
  }

  for (const [personId, allocs] of byPerson) {
    const person = peopleById.get(personId);
    for (let i = 0; i < allocs.length; i++) {
      for (let j = i + 1; j < allocs.length; j++) {
        const a = allocs[i];
        const b = allocs[j];
        if (a.project_id === b.project_id) continue;

        const overlap = dateOverlap(
          a.start_date,
          a.end_date,
          b.start_date,
          b.end_date,
        );
        if (!overlap) continue;

        const combined_fte = round2(a.fte + b.fte);
        if (combined_fte <= 1) continue;

        const pairKey = [a.project_id, b.project_id].sort().join("|");
        if (projectDepPairs.has(pairKey)) continue;

        const projectA = projectsById.get(a.project_id);
        const projectB = projectsById.get(b.project_id);
        const nameA = projectA?.name ?? a.project_id;
        const nameB = projectB?.name ?? b.project_id;

        conflicts.push({
          rule: "C5",
          severity: "warning",
          person_id: personId,
          window_start: overlap.start,
          window_end: overlap.end,
          metrics: {
            combined_fte: combined_fte,
            project_a: a.project_id,
            project_b: b.project_id,
          },
          explanation:
            `${person?.name ?? personId} is allocated ${Math.round(combined_fte * 100)}% across ${nameA} and ${nameB} from ${overlap.start} to ${overlap.end} with no declared dependency.`,
        });
      }
    }
  }

  return conflicts;
}

function evaluateC6(input: ConflictEngineInput): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const now = normalizeNow(input.now);
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const phasesById = new Map(input.phases.map((ph) => [ph.id, ph]));
  const dependencies = input.dependencies ?? [];

  for (const d of dependencies) {
    let predecessor_end: IsoDate | null = null;
    let predecessor_name: string = "";
    let predecessor_id: string = "";

    if (d.from_phase_id) {
      const phase = phasesById.get(d.from_phase_id);
      if (phase) {
        predecessor_end = phase.declared_end;
        predecessor_name = phase.name;
        predecessor_id = phase.id;
      }
    } else if (d.from_project_id) {
      const project = projectsById.get(d.from_project_id);
      if (project) {
        predecessor_end = project.declared_end;
        predecessor_name = project.name;
        predecessor_id = project.id;
      }
    }

    let successor_start: IsoDate | null = null;
    let successor_name: string = "";
    let successor_id: string = "";

    if (d.to_phase_id) {
      const phase = phasesById.get(d.to_phase_id);
      if (phase) {
        successor_start = phase.declared_start;
        successor_name = phase.name;
        successor_id = phase.id;
      }
    } else if (d.to_project_id) {
      const project = projectsById.get(d.to_project_id);
      if (project) {
        successor_start = project.declared_start;
        successor_name = project.name;
        successor_id = project.id;
      }
    }

    if (!predecessor_end || !successor_start) continue;

    const allowedStart = addDays(predecessor_end, d.lag_days);
    if (successor_start >= allowedStart) continue;

    const severity: EngineSeverity =
      parseDate(successor_start) < now ? "critical" : "at_risk";

    conflicts.push({
      rule: "C6",
      severity,
      project_id: d.from_project_id ?? undefined,
      phase_id: d.from_phase_id ?? d.to_phase_id ?? undefined,
      window_start: predecessor_end,
      window_end: successor_start,
      metrics: {
        predecessor_end,
        successor_start,
        lag_days: d.lag_days,
        from_id: predecessor_id,
        to_id: successor_id,
      },
      explanation:
        `Dependency violation: ${successor_name} starts ${successor_start}, before ${predecessor_name} finishes ${predecessor_end}${
          d.lag_days ? ` plus ${d.lag_days} day(s) lag` : ""
        }.`,
    });
  }

  return conflicts;
}

function evaluateC7(input: ConflictEngineInput): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const skillsById = new Map((input.skills ?? []).map((s) => [s.id, s]));
  const requirements = input.jrSkillRequirements ?? [];
  const workItems = input.workItems ?? [];
  const personSkills = input.personSkills ?? [];

  const workItemsById = new Map(workItems.map((w) => [w.id, w]));
  const ledgerByPerson = new Map<string, CapacityWeekEntry[]>();
  for (const row of input.ledger) {
    const list = ledgerByPerson.get(row.person_id) ?? [];
    list.push(row);
    ledgerByPerson.set(row.person_id, list);
  }

  const requiredByKey = new Map<
    string,
    { skill_id: string; min_level: number; required_h: number }
  >();
  for (const req of requirements) {
    const workItem = workItemsById.get(req.work_item_id);
    const hours = workItem?.estimate_normalized_hours ?? null;
    if (hours === null || hours <= 0) continue;

    const key = `${req.skill_id}:${req.min_level}`;
    const entry = requiredByKey.get(key) ?? {
      skill_id: req.skill_id,
      min_level: req.min_level,
      required_h: 0,
    };
    entry.required_h = round2(entry.required_h + hours);
    requiredByKey.set(key, entry);
  }

  for (const entry of requiredByKey.values()) {
    const qualified = new Set<string>();
    let free_h = 0;

    for (const ps of personSkills) {
      if (ps.skill_id !== entry.skill_id || ps.level < entry.min_level) {
        continue;
      }
      qualified.add(ps.person_id);
    }

    for (const personId of qualified) {
      for (const row of ledgerByPerson.get(personId) ?? []) {
        free_h += Math.max(0, row.available_h - row.planned_h);
      }
    }

    free_h = round2(free_h);
    const required_h = entry.required_h;

    let severity: EngineSeverity | null = null;
    if (free_h === 0 && required_h > 0) {
      severity = "critical";
    } else if (required_h > free_h) {
      severity = "at_risk";
    } else if (required_h > 0.8 * free_h) {
      severity = "warning";
    }

    if (!severity) continue;

    const skill = skillsById.get(entry.skill_id);
    conflicts.push({
      rule: "C7",
      severity,
      project_id: skill?.id,
      window_start: input.horizon.from,
      window_end: input.horizon.to,
      metrics: {
        required_h,
        free_h,
        qualified_people: qualified.size,
        skill_id: entry.skill_id,
        min_level: entry.min_level,
      },
      explanation:
        `Skill bottleneck: ${skill?.name ?? entry.skill_id} level ${entry.min_level} needs ${fmt(required_h)}h; ${qualified.size} qualified people have ${fmt(free_h)}h free.`,
    });
  }

  return conflicts;
}

function evaluateC8(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const skillsById = new Map((input.skills ?? []).map((s) => [s.id, s]));
  const personSkills = input.personSkills ?? [];

  const holdersBySkill = new Map<string, PersonSkill[]>();
  for (const ps of personSkills) {
    if (ps.level < 3) continue;
    const list = holdersBySkill.get(ps.skill_id) ?? [];
    list.push(ps);
    holdersBySkill.set(ps.skill_id, list);
  }

  const allocByPerson = new Map<string, Allocation[]>();
  for (const a of input.allocations) {
    const list = allocByPerson.get(a.person_id) ?? [];
    list.push(a);
    allocByPerson.set(a.person_id, list);
  }

  const weeks = weeksInHorizon(input.horizon.from, input.horizon.to);

  for (const [skillId, holders] of holdersBySkill) {
    if (holders.length !== 1) continue;

    const personId = holders[0].person_id;
    const person = peopleById.get(personId);
    const allocs = allocByPerson.get(personId) ?? [];

    let max_fte = 0;
    let max_projects = 0;

    for (const w of weeks) {
      let fte = 0;
      const projects = new Set<string>();
      for (const a of allocs) {
        if (a.start_date > w.end || a.end_date < w.start) continue;
        fte = round2(fte + a.fte);
        projects.add(a.project_id);
      }
      if (fte > max_fte) {
        max_fte = fte;
        max_projects = projects.size;
      }
    }

    if (max_fte > cfg.spofFteThreshold && max_projects >= 2) {
      const skill = skillsById.get(skillId);
      conflicts.push({
        rule: "C8",
        severity: "critical",
        person_id: personId,
        window_start: input.horizon.from,
        window_end: input.horizon.to,
        metrics: {
          total_fte: max_fte,
          project_count: max_projects,
          skill_id: skillId,
        },
        explanation:
          `${person?.name ?? personId} is the only ${skill?.name ?? skillId} holder at level 3+ and is allocated ${Math.round(max_fte * 100)}% across ${max_projects} projects — single point of failure.`,
      });
    }
  }

  return conflicts;
}

function evaluateC9(
  input: ConflictEngineInput,
  cfg: ConflictThresholds,
): EngineConflict[] {
  const conflicts: EngineConflict[] = [];
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const feasibilityResults = input.feasibilityResults ?? [];

  for (const f of feasibilityResults) {
    if (f.slack_days === null) continue;
    if (f.slack_days < 0) continue;
    if (f.slack_days >= f.buffer_days) continue;

    const project = projectsById.get(f.project_id);
    const window = project?.deadline ?? project?.declared_end ?? input.horizon.from;

    conflicts.push({
      rule: "C9",
      severity: "warning",
      project_id: f.project_id,
      window_start: window,
      window_end: window,
      metrics: {
        slack_days: f.slack_days,
        buffer_days: f.buffer_days,
      },
      explanation:
        `Project ${project?.name ?? f.project_id} schedule slack is ${f.slack_days} working day(s) — below the ${f.buffer_days}-day buffer target.`,
    });
  }

  const rowsByPerson = new Map<string, CapacityWeekEntry[]>();
  for (const row of input.ledger) {
    const list = rowsByPerson.get(row.person_id) ?? [];
    list.push(row);
    rowsByPerson.set(row.person_id, list);
  }

  for (const [personId, rows] of rowsByPerson) {
    const person = peopleById.get(personId);
    rows.sort((a, b) => a.week_key.localeCompare(b.week_key));

    let run: CapacityWeekEntry[] = [];
    const flushRun = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      let worst = run[0];
      for (const r of run) {
        const rGap = r.available_h - r.planned_h;
        const wGap = worst.available_h - worst.planned_h;
        if (rGap < wGap) worst = r;
      }

      const free_h = round2(worst.available_h - worst.planned_h);
      conflicts.push({
        rule: "C9",
        severity: "warning",
        person_id: personId,
        window_start: run[0].week_key,
        window_end: run[run.length - 1].week_key,
        metrics: {
          weeks: run.length,
          free_h,
          available_h: worst.available_h,
          buffer_pct: cfg.personBufferPct,
        },
        explanation:
          `${person?.name ?? personId} runs below the ${Math.round(cfg.personBufferPct * 100)}% personal buffer for ${run.length} consecutive weeks (${run[0].week_key}–${run[run.length - 1].week_key}): free ${fmt(free_h)}h of ${fmt(worst.available_h)}h available.`,
      });
      run = [];
    };

    for (const row of rows) {
      const bufferTarget = round2(cfg.personBufferPct * row.available_h);
      const free = round2(row.available_h - row.planned_h);
      const thin =
        row.available_h > 0 &&
        row.planned_h <= row.available_h &&
        free < bufferTarget;

      if (thin) {
        run.push(row);
      } else {
        flushRun();
      }
    }
    flushRun();
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
    ...evaluateC3(input, cfg),
    ...evaluateC4(input, cfg),
    ...evaluateC5(input),
    ...evaluateC6(input),
    ...evaluateC7(input),
    ...evaluateC8(input, cfg),
    ...evaluateC9(input, cfg),
    ...evaluateC10(input),
  ];
  conflicts.sort(compareConflicts);
  return conflicts;
}
