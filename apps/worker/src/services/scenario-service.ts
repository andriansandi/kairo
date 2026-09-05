import { applyScenarioOps, diffScenarioResults } from "@kairo/scenario";
import type {
  ScenarioSourceData,
  ScenarioDerived,
  ScenarioDiffResult,
  EngineConflict as ScenarioEngineConflict,
} from "@kairo/scenario";
import {
  buildCapacityLedger,
  rollupTeamCapacity,
  type CapacityWeekEntry,
} from "@kairo/capacity-engine";
import {
  evaluateConflicts,
  DEFAULT_CONFLICT_THRESHOLDS,
  type FeasibilitySummary,
  type EngineConflict,
} from "@kairo/conflict-engine";
import { computeFeasibility, type FeasibilityResult } from "@kairo/planning-engine";
import type {
  Allocation,
  Dependency,
  JrSkillRequirement,
  OrgCalendar,
  Person,
  PersonSkill,
  Project,
  ProjectPhase,
  PtoEntry,
  Role,
  ScenarioDefinition,
  ScenarioOp,
  Skill,
  Team,
  TeamMembership,
  WorkItem,
} from "@kairo/types";
import { all, first, fromJson, newId, nowIso, run, toJson } from "../db";
import {
  calculatePlanningHorizon,
  ensureCurrentSnapshot,
  loadOrgCalendar,
  mapAllocationRowToEngine,
  mapCapacityEntryRow,
  mapPersonRowToEngine,
  mapPhaseRowToEngine,
  mapProjectRowToEngine,
  mapPtoRowToEngine,
  mapTeamMembershipRowToEngine,
  mapTeamRowToEngine,
} from "./snapshot";

export function mapRoleRow(row: unknown): Role {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    seniority_ladder: fromJson(r.seniority_ladder, []) as string[],
  };
}

export function mapSkillRow(row: unknown): Skill {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as string,
    aliases: fromJson(r.aliases, []) as string[],
  };
}

export function mapPersonSkillRow(row: unknown): PersonSkill {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    person_id: r.person_id as string,
    skill_id: r.skill_id as string,
    level: Number(r.level) as PersonSkill["level"],
    verified_by: (r.verified_by as string | null) ?? null,
    source: (r.source as PersonSkill["source"]) ?? "manual",
  };
}

export function mapWorkItemRow(row: unknown): WorkItem {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    plane_id: r.plane_id as string,
    title: r.title as string,
    status: (r.status as WorkItem["status"]) ?? "backlog",
    priority: r.priority == null ? null : Number(r.priority),
    assignee_ids: fromJson(r.assignee_ids, []) as string[],
    start_date: (r.start_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    estimate_raw: (r.estimate_raw as string | null) ?? null,
    estimate_normalized_hours:
      r.estimate_normalized_hours == null
        ? null
        : Number(r.estimate_normalized_hours),
    cycle: (r.cycle as string | null) ?? null,
    labels: fromJson(r.labels, []) as string[],
    updated_at: (r.updated_at as string) ?? nowIso(),
  };
}

export function mapDependencyRow(row: unknown): Dependency {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    from_project_id: (r.from_project_id as string | null) ?? null,
    from_phase_id: (r.from_phase_id as string | null) ?? null,
    to_project_id: (r.to_project_id as string | null) ?? null,
    to_phase_id: (r.to_phase_id as string | null) ?? null,
    type: (r.type as Dependency["type"]) ?? "FS",
    lag_days: Number(r.lag_days ?? 0),
    source: (r.source as Dependency["source"]) ?? "manual",
  };
}

export function mapJrSkillRequirementRow(row: unknown): JrSkillRequirement {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    work_item_id: r.work_item_id as string,
    skill_id: r.skill_id as string,
    min_level: Number(r.min_level) as JrSkillRequirement["min_level"],
    weight: (r.weight as JrSkillRequirement["weight"]) ?? "must",
    source: (r.source as JrSkillRequirement["source"]) ?? "manual",
  };
}

export function mapScenarioDefRow(row: unknown): ScenarioDefinition {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    base_snapshot_id: r.base_snapshot_id as string,
    ops: fromJson(r.ops, []) as ScenarioOp[],
    created_by: r.created_by as string,
    status: (r.status as ScenarioDefinition["status"]) ?? "draft",
    created_at: (r.created_at as string) ?? nowIso(),
  };
}

export function mapConflictRowToEngine(row: unknown): ScenarioEngineConflict {
  const r = row as Record<string, unknown>;
  const metrics = fromJson(r.metrics, {}) as Record<string, number | string>;
  return {
    rule: r.rule as ScenarioEngineConflict["rule"],
    severity: r.severity as ScenarioEngineConflict["severity"],
    person_id: (r.person_id as string | null) ?? undefined,
    team_id: (r.team_id as string | null) ?? undefined,
    project_id: (r.project_id as string | null) ?? undefined,
    phase_id: (r.phase_id as string | null) ?? undefined,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    metrics,
    explanation: (r.explanation as string) ?? "",
  };
}

export function mapFeasibilityRowToEngine(row: unknown): FeasibilityResult {
  const r = row as Record<string, unknown>;
  return {
    project_id: r.project_id as string,
    computed_start: r.computed_start as string,
    computed_finish: r.computed_finish as string,
    declared_finish: null,
    deadline: null,
    slack_days: Number(r.slack_days ?? 0),
    buffer_days: Number(r.buffer_days ?? 0),
    verdict: r.verdict as FeasibilityResult["verdict"],
    drivers: fromJson(r.drivers, []) as string[],
    critical_path: fromJson(r.critical_path, []) as string[],
    per_phase: [],
  };
}

export async function loadScenarioSource(
  db: D1Database,
): Promise<ScenarioSourceData> {
  const [
    personRows,
    teamRows,
    membershipRows,
    roleRows,
    skillRows,
    personSkillRows,
    allocationRows,
    ptoRows,
    projectRows,
    phaseRows,
    workItemRows,
    dependencyRows,
    jrRows,
    calendar,
  ] = await Promise.all([
    all<Record<string, unknown>>(db, "SELECT * FROM person WHERE active = 1"),
    all<Record<string, unknown>>(db, "SELECT * FROM team"),
    all<Record<string, unknown>>(db, "SELECT * FROM team_membership"),
    all<Record<string, unknown>>(db, "SELECT * FROM role"),
    all<Record<string, unknown>>(db, "SELECT * FROM skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM person_skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(db, "SELECT * FROM pto_entry"),
    all<Record<string, unknown>>(db, "SELECT * FROM project"),
    all<Record<string, unknown>>(db, "SELECT * FROM phase"),
    all<Record<string, unknown>>(db, "SELECT * FROM work_item"),
    all<Record<string, unknown>>(db, "SELECT * FROM dependency"),
    all<Record<string, unknown>>(db, "SELECT * FROM jr_skill_requirement"),
    loadOrgCalendar(db),
  ]);

  return {
    people: personRows.map(mapPersonRowToEngine),
    teams: teamRows.map(mapTeamRowToEngine),
    memberships: membershipRows.map(mapTeamMembershipRowToEngine),
    roles: roleRows.map(mapRoleRow),
    skills: skillRows.map(mapSkillRow),
    personSkills: personSkillRows.map(mapPersonSkillRow),
    allocations: allocationRows.map(mapAllocationRowToEngine),
    ptoEntries: ptoRows.map(mapPtoRowToEngine),
    projects: projectRows.map(mapProjectRowToEngine),
    phases: phaseRows.map(mapPhaseRowToEngine),
    workItems: workItemRows.map(mapWorkItemRow),
    dependencies: dependencyRows.map(mapDependencyRow),
    jrSkillRequirements: jrRows.map(mapJrSkillRequirementRow),
    calendar,
  };
}

export function runEngines(data: ScenarioSourceData): ScenarioDerived {
  const horizon = calculatePlanningHorizon(data.allocations);

  const ledger = buildCapacityLedger({
    people: data.people,
    allocations: data.allocations,
    ptoEntries: data.ptoEntries,
    calendar: data.calendar,
    horizon,
  });

  const teamWeeks = rollupTeamCapacity({
    ledger,
    teams: data.teams,
    memberships: data.memberships,
  });

  const projectsWithPhases = data.projects.filter((p) =>
    data.phases.some((ph) => ph.project_id === p.id),
  );

  const feasibility = projectsWithPhases.map((project) =>
    computeFeasibility({
      project,
      phases: data.phases,
      allocations: data.allocations,
      people: data.people,
      dependencies: data.dependencies,
      calendar: data.calendar,
    }),
  );

  const feasibilityResults: FeasibilitySummary[] = feasibility.map((f) => ({
    project_id: f.project_id,
    slack_days: f.slack_days,
    buffer_days: f.buffer_days,
    verdict: f.verdict,
  }));

  const conflicts = evaluateConflicts({
    ledger,
    teamWeeks,
    people: data.people,
    teams: data.teams,
    projects: data.projects,
    phases: data.phases,
    allocations: data.allocations,
    calendar: data.calendar,
    horizon,
    config: DEFAULT_CONFLICT_THRESHOLDS,
    skills: data.skills,
    personSkills: data.personSkills,
    jrSkillRequirements: data.jrSkillRequirements,
    workItems: data.workItems,
    dependencies: data.dependencies,
    teamMemberships: data.memberships,
    feasibilityResults,
  });

  return {
    ledger,
    conflicts: conflicts as unknown as ScenarioEngineConflict[],
    feasibility,
  };
}

export interface RecomputeResult {
  scenario: ScenarioDefinition;
  diff: ScenarioDiffResult;
}

export async function loadBaseDerived(
  db: D1Database,
  snapshotId: string,
): Promise<ScenarioDerived> {
  const [capacityRows, conflictRows, feasibilityRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM capacity_entry WHERE snapshot_id = ?",
      snapshotId,
    ),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM conflict WHERE snapshot_id = ?",
      snapshotId,
    ),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM feasibility_result WHERE snapshot_id = ?",
      snapshotId,
    ),
  ]);

  return {
    ledger: capacityRows.map(mapCapacityEntryRow),
    conflicts: conflictRows.map(mapConflictRowToEngine),
    feasibility: feasibilityRows.map(mapFeasibilityRowToEngine),
  };
}

export async function recomputeScenario(
  db: D1Database,
  scenarioId: string,
): Promise<RecomputeResult> {
  const { snapshot: baseSnapshot } = await ensureCurrentSnapshot(db);

  const scenarioRow = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM scenario_def WHERE id = ?",
    scenarioId,
  );
  if (!scenarioRow) {
    throw new Error(`scenario ${scenarioId} not found`);
  }

  const scenario = mapScenarioDefRow(scenarioRow);
  const source = await loadScenarioSource(db);
  const { data: mutated } = applyScenarioOps(source, scenario.ops);
  const derived = runEngines(mutated);
  const base = await loadBaseDerived(db, baseSnapshot.id);
  const diff = diffScenarioResults(base, derived);

  await run(db, "DELETE FROM scenario_diff WHERE scenario_id = ?", scenarioId);
  await run(
    db,
    `INSERT INTO scenario_diff
      (id, base_snapshot_id, scenario_id, capacity_deltas, conflict_changes, feasibility_deltas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(),
    baseSnapshot.id,
    scenarioId,
    toJson(diff.capacity_deltas),
    toJson(diff.conflict_changes),
    toJson(diff.feasibility_deltas),
  );

  await run(
    db,
    "UPDATE scenario_def SET status = 'saved', updated_at = ? WHERE id = ?",
    nowIso(),
    scenarioId,
  );

  return {
    scenario: { ...scenario, status: "saved" },
    diff,
  };
}

