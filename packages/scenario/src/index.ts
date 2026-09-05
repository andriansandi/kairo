/// <reference path="./crypto.d.ts" />
import { nextWorkingDay } from "@kairo/calendar";
import type { FeasibilityResult } from "@kairo/planning-engine";
import type {
  Allocation,
  CapacityWeekEntry,
  Dependency,
  IsoDate,
  JrSkillRequirement,
  OrgCalendar,
  Person,
  PersonSkill,
  Project,
  ProjectPhase,
  PtoEntry,
  Role,
  ScenarioOp,
  Skill,
  Team,
  TeamMembership,
  WorkItem,
} from "@kairo/types";

export type EngineSeverity = "warning" | "at_risk" | "critical";

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

export interface ScenarioSourceData {
  people: Person[];
  teams: Team[];
  memberships: TeamMembership[];
  roles: Role[];
  skills: Skill[];
  personSkills: PersonSkill[];
  allocations: Allocation[];
  ptoEntries: PtoEntry[];
  projects: Project[];
  phases: ProjectPhase[];
  workItems: WorkItem[];
  dependencies: Dependency[];
  jrSkillRequirements: JrSkillRequirement[];
  calendar: OrgCalendar;
}

export interface ScenarioDerived {
  ledger: CapacityWeekEntry[];
  conflicts: EngineConflict[];
  feasibility: FeasibilityResult[];
}

export interface ScenarioDiffResult {
  summary: {
    utilization_changed_person_weeks: number;
    conflicts_added: number;
    conflicts_removed: number;
    feasibility_changed_projects: number;
  };
  capacity_deltas: {
    person_id: string;
    week_key: string;
    base_utilization: number;
    scenario_utilization: number;
    delta: number;
  }[];
  conflict_changes: {
    added: EngineConflict[];
    removed: EngineConflict[];
  };
  feasibility_deltas: {
    project_id: string;
    base: { verdict: string; computed_finish: string };
    scenario: { verdict: string; computed_finish: string };
  }[];
}

const DAY_MS = 86_400_000;

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
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

function shiftWeeks(
  date: IsoDate | null,
  weeks: number,
  calendar: OrgCalendar,
): IsoDate | null {
  if (date === null) return null;
  return nextWorkingDay(addDays(date, weeks * 7), calendar);
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function requireProject(data: ScenarioSourceData, projectId: string): Project {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`project ${projectId} not found`);
  return project;
}

function requirePerson(data: ScenarioSourceData, personId: string): Person {
  const person = data.people.find((p) => p.id === personId);
  if (!person) throw new Error(`person ${personId} not found`);
  return person;
}

function requireSkill(data: ScenarioSourceData, skillId: string): Skill {
  const skill = data.skills.find((s) => s.id === skillId);
  if (!skill) throw new Error(`skill ${skillId} not found`);
  return skill;
}

function requireAllocation(data: ScenarioSourceData, allocationId: string): Allocation {
  const allocation = data.allocations.find((a) => a.id === allocationId);
  if (!allocation) throw new Error(`allocation ${allocationId} not found`);
  return allocation;
}

function validateWorkItemIds(
  data: ScenarioSourceData,
  workItemIds: string[],
): void {
  for (const id of workItemIds) {
    const item = data.workItems.find((w) => w.id === id);
    if (!item) throw new Error(`work item ${id} not found`);
  }
}

function formatShot(items: string[]): string {
  return items.length <= 3 ? items.join(", ") : `${items.slice(0, 3).join(", ")} +${items.length - 3} more`;
}

export function applyScenarioOps(
  source: ScenarioSourceData,
  ops: ScenarioOp[],
  idFactory: () => string = defaultIdFactory,
): { data: ScenarioSourceData; changes: string[] } {
  const data = deepClone(source);
  const changes: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "move_project": {
        const project = requireProject(data, op.project_id);
        const shift = (date: IsoDate | null) =>
          shiftWeeks(date, op.weeks, data.calendar);

        project.deadline = shift(project.deadline);
        project.declared_start = shift(project.declared_start);
        project.declared_end = shift(project.declared_end);

        for (const phase of data.phases) {
          if (phase.project_id !== op.project_id) continue;
          phase.declared_start = shift(phase.declared_start)!;
          phase.declared_end = shift(phase.declared_end)!;
        }

        for (const allocation of data.allocations) {
          if (allocation.project_id !== op.project_id) continue;
          allocation.start_date = shift(allocation.start_date)!;
          allocation.end_date = shift(allocation.end_date)!;
        }

        for (const workItem of data.workItems) {
          if (workItem.project_id !== op.project_id) continue;
          workItem.start_date = shift(workItem.start_date);
          workItem.due_date = shift(workItem.due_date);
        }

        changes.push(`moved project ${op.project_id} by ${op.weeks} week(s)`);
        break;
      }

      case "set_deadline": {
        const project = requireProject(data, op.project_id);
        project.deadline = op.date;
        changes.push(`set deadline for project ${op.project_id} to ${op.date}`);
        break;
      }

      case "add_allocation": {
        requirePerson(data, op.person_id);
        requireProject(data, op.project_id);
        if (op.phase_id !== undefined) {
          const phase = data.phases.find((p) => p.id === op.phase_id);
          if (!phase) throw new Error(`phase ${op.phase_id} not found`);
          if (phase.project_id !== op.project_id) {
            throw new Error(
              `phase ${op.phase_id} does not belong to project ${op.project_id}`,
            );
          }
        }
        const id = idFactory();
        data.allocations.push({
          id,
          person_id: op.person_id,
          project_id: op.project_id,
          phase_id: op.phase_id ?? null,
          fte: op.fte,
          start_date: op.start_date,
          end_date: op.end_date,
          status: "proposed",
          source: "manual",
        });
        changes.push(`added allocation ${id} to project ${op.project_id}`);
        break;
      }

      case "remove_allocation": {
        const index = data.allocations.findIndex(
          (a) => a.id === op.allocation_id,
        );
        if (index === -1) {
          throw new Error(`allocation ${op.allocation_id} not found`);
        }
        data.allocations.splice(index, 1);
        changes.push(`removed allocation ${op.allocation_id}`);
        break;
      }

      case "change_allocation_fte": {
        const allocation = requireAllocation(data, op.allocation_id);
        allocation.fte = op.fte;
        changes.push(
          `changed allocation ${op.allocation_id} FTE to ${op.fte}`,
        );
        break;
      }

      case "defer_work_items": {
        validateWorkItemIds(data, op.work_item_ids);
        const idSet = new Set(op.work_item_ids);
        data.workItems = data.workItems.filter((w) => !idSet.has(w.id));
        data.jrSkillRequirements = data.jrSkillRequirements.filter(
          (r) => !idSet.has(r.work_item_id),
        );
        changes.push(`deferred work items: ${formatShot(op.work_item_ids)}`);
        break;
      }

      case "add_person_skill": {
        requirePerson(data, op.person_id);
        requireSkill(data, op.skill_id);
        const id = idFactory();
        data.personSkills.push({
          id,
          person_id: op.person_id,
          skill_id: op.skill_id,
          level: op.level,
          source: "manual",
          verified_by: null,
        });
        changes.push(`added person skill ${id}`);
        break;
      }

      default: {
        // Exhaustiveness check for unknown op discriminator.
        throw new Error(`unknown scenario op: ${(op as ScenarioOp).op}`);
      }
    }
  }

  return { data, changes };
}

function conflictKey(conflict: EngineConflict): string {
  const normalize = (value: string | undefined) => value ?? "";
  return [
    conflict.rule,
    normalize(conflict.person_id),
    normalize(conflict.team_id),
    normalize(conflict.project_id),
    normalize(conflict.phase_id),
  ].join("|");
}

function buildConflictMap(conflicts: EngineConflict[]): Map<string, EngineConflict> {
  const map = new Map<string, EngineConflict>();
  for (const conflict of conflicts) {
    const key = conflictKey(conflict);
    if (!map.has(key)) map.set(key, conflict);
  }
  return map;
}

export function diffScenarioResults(
  base: ScenarioDerived,
  scenario: ScenarioDerived,
): ScenarioDiffResult {
  const capacityDeltas: ScenarioDiffResult["capacity_deltas"] = [];
  const baseCapacity = new Map<string, CapacityWeekEntry>();
  for (const entry of base.ledger) {
    baseCapacity.set(`${entry.person_id}|${entry.week_key}`, entry);
  }

  const scenarioCapacity = new Map<string, CapacityWeekEntry>();
  for (const entry of scenario.ledger) {
    scenarioCapacity.set(`${entry.person_id}|${entry.week_key}`, entry);
  }

  const allCapacityKeys = new Set([
    ...baseCapacity.keys(),
    ...scenarioCapacity.keys(),
  ]);
  const sortedCapacityKeys = [...allCapacityKeys].sort();

  for (const key of sortedCapacityKeys) {
    const baseEntry = baseCapacity.get(key);
    const scenarioEntry = scenarioCapacity.get(key);
    const baseUtilization = baseEntry?.utilization ?? 0;
    const scenarioUtilization = scenarioEntry?.utilization ?? 0;
    const delta = round2(scenarioUtilization - baseUtilization);
    if (delta === 0) continue;

    const [person_id, week_key] = key.split("|");
    capacityDeltas.push({
      person_id,
      week_key,
      base_utilization: baseUtilization,
      scenario_utilization: scenarioUtilization,
      delta,
    });
  }

  const baseConflicts = buildConflictMap(base.conflicts);
  const scenarioConflicts = buildConflictMap(scenario.conflicts);

  const added: EngineConflict[] = [];
  const removed: EngineConflict[] = [];

  for (const [key, conflict] of scenarioConflicts) {
    if (!baseConflicts.has(key)) added.push(conflict);
  }
  for (const [key, conflict] of baseConflicts) {
    if (!scenarioConflicts.has(key)) removed.push(conflict);
  }

  added.sort((a, b) => conflictKey(a).localeCompare(conflictKey(b)));
  removed.sort((a, b) => conflictKey(a).localeCompare(conflictKey(b)));

  const baseFeasibility = new Map<string, FeasibilityResult>();
  for (const result of base.feasibility) {
    baseFeasibility.set(result.project_id, result);
  }
  const scenarioFeasibility = new Map<string, FeasibilityResult>();
  for (const result of scenario.feasibility) {
    scenarioFeasibility.set(result.project_id, result);
  }

  const allProjectIds = new Set([
    ...baseFeasibility.keys(),
    ...scenarioFeasibility.keys(),
  ]);
  const sortedProjectIds = [...allProjectIds].sort();

  const feasibilityDeltas: ScenarioDiffResult["feasibility_deltas"] = [];
  for (const project_id of sortedProjectIds) {
    const baseResult = baseFeasibility.get(project_id);
    const scenarioResult = scenarioFeasibility.get(project_id);
    const baseVerdict = baseResult?.verdict ?? "missing";
    const scenarioVerdict = scenarioResult?.verdict ?? "missing";
    const baseFinish = baseResult?.computed_finish ?? "";
    const scenarioFinish = scenarioResult?.computed_finish ?? "";

    if (baseVerdict !== scenarioVerdict || baseFinish !== scenarioFinish) {
      feasibilityDeltas.push({
        project_id,
        base: { verdict: baseVerdict, computed_finish: baseFinish },
        scenario: { verdict: scenarioVerdict, computed_finish: scenarioFinish },
      });
    }
  }

  return {
    summary: {
      utilization_changed_person_weeks: capacityDeltas.length,
      conflicts_added: added.length,
      conflicts_removed: removed.length,
      feasibility_changed_projects: feasibilityDeltas.length,
    },
    capacity_deltas: capacityDeltas,
    conflict_changes: { added, removed },
    feasibility_deltas: feasibilityDeltas,
  };
}
