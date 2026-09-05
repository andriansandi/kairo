import type {
  Person,
  Allocation,
  PtoEntry,
  OrgCalendar,
  Team,
  TeamMembership,
  Project,
  ProjectPhase,
  CapacityWeekEntry,
  PlanningSnapshot,
  Skill,
  PersonSkill,
  JrSkillRequirement,
  WorkItem,
  Dependency,
  FeasibilityResult as PersistedFeasibilityResult,
} from "@kairo/types";
import {
  buildCapacityLedger,
  rollupTeamCapacity,
  MAX_UTILIZATION_SENTINEL,
  type TeamWeekEntry,
  type ProjectWeekEntry,
} from "@kairo/capacity-engine";
import {
  evaluateConflicts,
  type EngineConflict,
  type ConflictEngineInput,
  type ConflictThresholds,
  DEFAULT_CONFLICT_THRESHOLDS,
} from "@kairo/conflict-engine";
import {
  computeFeasibility,
  generateAlternatives,
  type FeasibilityResult,
  type FeasibilityInput,
  type Alternative,
} from "@kairo/planning-engine";
import { weekStart, isoWeekKey } from "@kairo/calendar";
import { all, first, newId, nowIso, run, fromJson } from "../db";

export { MAX_UTILIZATION_SENTINEL, DEFAULT_CONFLICT_THRESHOLDS };
export type { TeamWeekEntry, ProjectWeekEntry, EngineConflict };
export type { FeasibilityResult, FeasibilityInput, Alternative };

export const SNAPSHOT_SOURCE_TABLES = [
  "project",
  "work_item",
  "phase",
  "dependency",
  "person",
  "team",
  "team_membership",
  "role",
  "skill",
  "person_skill",
  "allocation",
  "pto_entry",
  "org_calendar",
  "jr_skill_requirement",
  "timeline_import",
  "scenario_def",
] as const;

const DAY_MS = 86_400_000;

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setTime(d.getTime() + n * DAY_MS);
  return formatDate(d);
}

export function todayIso(): string {
  return formatDate(new Date());
}

export function calculatePlanningHorizon(
  allocations: Array<{ end_date: string }>,
  today = todayIso(),
): { from: string; to: string } {
  const from = weekStart(addDays(today, -28));
  const future = weekStart(addDays(today, 26 * 7));
  let to = future;
  for (const a of allocations) {
    if (a.end_date > to) to = a.end_date;
  }
  return { from, to };
}

export function getWeekRange(
  from?: string,
  to?: string,
  today = todayIso(),
): { fromDate: string; toDate: string; fromKey: string; toKey: string } {
  const fromDate = from ? weekStart(from) : weekStart(addDays(today, -28));
  const toDate = to ? weekStart(to) : weekStart(addDays(today, 12 * 7));
  return {
    fromDate,
    toDate,
    fromKey: isoWeekKey(fromDate),
    toKey: isoWeekKey(toDate),
  };
}

export function conflictKey(c: {
  rule: string;
  person_id?: string | null;
  team_id?: string | null;
  project_id?: string | null;
  phase_id?: string | null;
}): string {
  return `${c.rule}|${c.person_id ?? ""}|${c.team_id ?? ""}|${
    c.project_id ?? ""
  }|${c.phase_id ?? ""}`;
}

export function filterByWeekRange<T extends { week_key: string }>(
  rows: T[],
  fromKey: string,
  toKey: string,
): T[] {
  return rows.filter((r) => r.week_key >= fromKey && r.week_key <= toKey);
}

export async function resolveTimestampColumn(
  db: D1Database,
  table: string,
): Promise<string | null> {
  type ColumnInfo = { name: string };
  const columns = await all<ColumnInfo>(db, `PRAGMA table_info(${table})`);
  const names = new Set(columns.map((c) => c.name));
  if (names.has("updated_at")) return "updated_at";
  if (names.has("created_at")) return "created_at";
  return null;
}

type FingerprintRow = [string, string];

export async function computeInputsFingerprint(db: D1Database): Promise<{
  fingerprint: string;
  counts: Record<string, number>;
}> {
  const rowsByTable: Record<string, FingerprintRow[]> = {};
  const counts: Record<string, number> = {};

  for (const table of SNAPSHOT_SOURCE_TABLES) {
    const tsCol = await resolveTimestampColumn(db, table);
    const tsSql = tsCol ? `COALESCE(${tsCol}, '')` : "''";
    const rows = await all<{ id: string; ts: string | null }>(
      db,
      `SELECT id, ${tsSql} AS ts FROM ${table} ORDER BY id`,
    );
    counts[table] = rows.length;
    rowsByTable[table] = rows.map((r) => [r.id, r.ts ?? ""]);
  }

  const fingerprint = await fingerprintFromRows(rowsByTable);
  return { fingerprint, counts };
}

export async function fingerprintFromRows(
  rowsByTable: Record<string, FingerprintRow[]>,
): Promise<string> {
  const encoder = new TextEncoder();
  const canonical = canonicalInputsString(rowsByTable);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalInputsString(
  rowsByTable: Record<string, FingerprintRow[]>,
): string {
  const ordered: Record<string, FingerprintRow[]> = {};
  for (const key of Object.keys(rowsByTable).sort()) {
    ordered[key] = rowsByTable[key]!;
  }
  return JSON.stringify(ordered);
}

export function mapPersonRowToEngine(row: unknown): Person {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role_id: r.role_id as string,
    seniority: Number(r.seniority),
    hours_per_day: Number(r.hours_per_day ?? 8),
    overhead_pct: Number(r.overhead_pct ?? 0.2),
    active: Boolean(r.active),
  };
}

export function mapAllocationRowToEngine(row: unknown): Allocation {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    person_id: r.person_id as string,
    project_id: r.project_id as string,
    phase_id: (r.phase_id as string | null) ?? null,
    fte: Number(r.fte),
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    status: r.status as Allocation["status"],
    source: (r.source as Allocation["source"]) ?? "manual",
  };
}

export function mapPtoRowToEngine(row: unknown): PtoEntry {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    person_id: r.person_id as string,
    dates: fromJson(r.dates, ["", ""]) as [string, string],
    type: (r.type as PtoEntry["type"]) ?? "pto",
  };
}

export function parseOrgCalendarRow(row: unknown | undefined): OrgCalendar {
  if (!row) {
    return {
      id: "default",
      workingDays: [1, 2, 3, 4, 5],
      holidays: [],
    };
  }
  const r = row as Record<string, unknown>;
  return {
    id: (r.id as string) ?? "default",
    workingDays: fromJson(r.working_days, [1, 2, 3, 4, 5]),
    holidays: fromJson(r.holidays, []) as string[],
  };
}

export function mapProjectRowToEngine(row: unknown): Project {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    plane_id: (r.plane_id as string | null) ?? null,
    code: r.code as string,
    name: r.name as string,
    status: r.status as Project["status"],
    priority: r.priority == null ? null : Number(r.priority),
    deadline: (r.deadline as string | null) ?? null,
    declared_start: (r.declared_start as string | null) ?? null,
    declared_end: (r.declared_end as string | null) ?? null,
    team_scope: fromJson(r.team_scope, []) as string[],
    created_at: (r.created_at as string) ?? nowIso(),
    updated_at: (r.updated_at as string) ?? nowIso(),
  };
}

export function mapPhaseRowToEngine(row: unknown): ProjectPhase {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    name: r.name as string,
    sequence: Number(r.sequence),
    declared_start: r.declared_start as string,
    declared_end: r.declared_end as string,
    effort_hours: Number(r.effort_hours ?? 0),
    status: (r.status as ProjectPhase["status"]) ?? "draft",
    source: (r.source as ProjectPhase["source"]) ?? "manual",
  };
}

export function mapTeamRowToEngine(row: unknown): Team {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as Team["type"],
  };
}

export function mapTeamMembershipRowToEngine(row: unknown): TeamMembership {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    person_id: r.person_id as string,
    team_id: r.team_id as string,
  };
}

export function mapCapacityEntryRow(row: unknown): CapacityWeekEntry {
  const r = row as Record<string, unknown>;
  return {
    week_key: r.week_key as string,
    person_id: r.person_id as string,
    gross_h: Number(r.gross_h),
    pto_h: Number(r.pto_h),
    overhead_h: Number(r.overhead_h),
    available_h: Number(r.available_h),
    planned_h: Number(r.planned_h),
    utilization: Number(r.utilization),
    flags: fromJson(r.flags, []) as string[],
  };
}

export function mapSkillRowToEngine(row: unknown): Skill {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    category: (r.category as string) ?? "",
    aliases: fromJson(r.aliases, []) as string[],
  };
}

export function mapPersonSkillRowToEngine(row: unknown): PersonSkill {
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

export function mapJrSkillRequirementRowToEngine(
  row: unknown,
): JrSkillRequirement {
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

export function mapWorkItemRowToEngine(row: unknown): WorkItem {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    plane_id: (r.plane_id as string) ?? "",
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

export function mapDependencyRowToEngine(row: unknown): Dependency {
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

export function mapFeasibilityResultRow(
  row: unknown,
): PersistedFeasibilityResult {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    snapshot_id: r.snapshot_id as string,
    project_id: r.project_id as string,
    computed_start: r.computed_start as string,
    computed_finish: r.computed_finish as string,
    slack_days: Number(r.slack_days ?? 0),
    buffer_days: Number(r.buffer_days ?? 0),
    verdict: r.verdict as PersistedFeasibilityResult["verdict"],
    drivers: fromJson(r.drivers, []) as string[],
    critical_path: fromJson(r.critical_path, []) as string[],
    per_phase_load: fromJson(r.per_phase_load, {}) as Record<string, number>,
  };
}

export async function loadOrgCalendar(db: D1Database): Promise<OrgCalendar> {
  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM org_calendar LIMIT 1",
  );
  return parseOrgCalendarRow(row);
}

export function buildFeasibilityInput(params: {
  project: Project;
  phases: ProjectPhase[];
  allocations: Allocation[];
  people: Person[];
  dependencies: Dependency[];
  calendar: OrgCalendar;
  bufferTargetPct?: number;
}): FeasibilityInput {
  return {
    project: params.project,
    phases: params.phases,
    allocations: params.allocations,
    people: params.people,
    dependencies: params.dependencies,
    calendar: params.calendar,
    bufferTargetPct: params.bufferTargetPct,
    now: todayIso(),
  };
}

export function toFeasibilityResultPersistence(
  snapshotId: string,
  result: FeasibilityResult,
): {
  id: string;
  snapshot_id: string;
  project_id: string;
  computed_start: string;
  computed_finish: string;
  slack_days: number;
  buffer_days: number;
  verdict: FeasibilityResult["verdict"];
  drivers: string;
  critical_path: string;
  per_phase_load: string;
} {
  const slackDays = result.slack_days ?? 0;
  const drivers =
    result.slack_days === null
      ? [...result.drivers, "no deadline set"]
      : result.drivers;
  const perPhaseLoad = Object.fromEntries(
    result.per_phase.map((p) => [p.phase_id, p.staffed_fte]),
  );
  return {
    id: newId(),
    snapshot_id: snapshotId,
    project_id: result.project_id,
    computed_start: result.computed_start,
    computed_finish: result.computed_finish,
    slack_days: slackDays,
    buffer_days: result.buffer_days,
    verdict: result.verdict,
    drivers: JSON.stringify(drivers),
    critical_path: JSON.stringify(result.critical_path),
    per_phase_load: JSON.stringify(perPhaseLoad),
  };
}

export function toFeasibilitySummary(result: FeasibilityResult): {
  project_id: string;
  slack_days: number;
  buffer_days: number;
  verdict: string;
} {
  return {
    project_id: result.project_id,
    slack_days: result.slack_days ?? 0,
    buffer_days: result.buffer_days,
    verdict: result.verdict,
  };
}

export function resolveConflictThresholds(
  value: unknown,
  fallback = DEFAULT_CONFLICT_THRESHOLDS,
): ConflictThresholds {
  try {
    const parsed =
      typeof value === "string" && value.length > 0
        ? JSON.parse(value)
        : value;
    if (!parsed || typeof parsed !== "object") return fallback;
    const out: ConflictThresholds = { ...fallback };
    for (const key of Object.keys(fallback) as (keyof ConflictThresholds)[]) {
      if (typeof parsed[key] === "number") {
        out[key] = parsed[key];
      }
    }
    return out;
  } catch {
    return fallback;
  }
}

export function buildConflictEngineInput(params: {
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
  dependencies?: Dependency[];
  teamMemberships?: TeamMembership[];
  feasibilityResults?: FeasibilityResult[];
  now?: string;
}): ConflictEngineInput {
  return {
    ledger: params.ledger,
    teamWeeks: params.teamWeeks,
    people: params.people,
    teams: params.teams,
    projects: params.projects,
    phases: params.phases,
    allocations: params.allocations,
    calendar: params.calendar,
    horizon: params.horizon,
    config: params.config,
    skills: params.skills,
    personSkills: params.personSkills,
    jrSkillRequirements: params.jrSkillRequirements,
    workItems: params.workItems,
    dependencies: params.dependencies,
    teamMemberships: params.teamMemberships,
    feasibilityResults: (params.feasibilityResults ?? []).map(
      toFeasibilitySummary,
    ),
    now: params.now ?? todayIso(),
  };
}

export function personFreeHoursFromLedger(
  ledger: CapacityWeekEntry[],
): Record<string, number> {
  const map = new Map<string, number>();
  for (const row of ledger) {
    const add = Math.max(0, row.available_h - row.planned_h);
    map.set(row.person_id, (map.get(row.person_id) ?? 0) + add);
  }
  return Object.fromEntries(map);
}

export interface DerivedCounts {
  capacity_entries: number;
  feasibility_results: number;
  conflicts: number;
  resolved: number;
}

export async function computeAndPersistDerived(
  db: D1Database,
  snapshotId: string,
): Promise<DerivedCounts> {
  await run(db, "DELETE FROM capacity_entry WHERE snapshot_id = ?", snapshotId);
  await run(db, "DELETE FROM conflict WHERE snapshot_id = ?", snapshotId);
  await run(
    db,
    "DELETE FROM feasibility_result WHERE snapshot_id = ?",
    snapshotId,
  );

  const [
    personRows,
    allocationRows,
    ptoRows,
    calendarRow,
    projectRows,
    phaseRows,
    teamRows,
    membershipRows,
    skillRows,
    personSkillRows,
    jrRequirementRows,
    workItemRows,
    dependencyRows,
    settingRow,
  ] = await Promise.all([
    all<Record<string, unknown>>(db, "SELECT * FROM person"),
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(db, "SELECT * FROM pto_entry"),
    first<Record<string, unknown>>(db, "SELECT * FROM org_calendar LIMIT 1"),
    all<Record<string, unknown>>(db, "SELECT * FROM project"),
    all<Record<string, unknown>>(db, "SELECT * FROM phase"),
    all<Record<string, unknown>>(db, "SELECT * FROM team"),
    all<Record<string, unknown>>(db, "SELECT * FROM team_membership"),
    all<Record<string, unknown>>(db, "SELECT * FROM skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM person_skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM jr_skill_requirement"),
    all<Record<string, unknown>>(db, "SELECT * FROM work_item"),
    all<Record<string, unknown>>(db, "SELECT * FROM dependency"),
    first<{ value: string }>(
      db,
      "SELECT value FROM app_setting WHERE key = 'conflict_thresholds'",
    ),
  ]);

  const people = personRows.map(mapPersonRowToEngine);
  const allocations = allocationRows.map(mapAllocationRowToEngine);
  const ptoEntries = ptoRows.map(mapPtoRowToEngine);
  const calendar = parseOrgCalendarRow(calendarRow);
  const projects = projectRows.map(mapProjectRowToEngine);
  const phases = phaseRows.map(mapPhaseRowToEngine);
  const teams = teamRows.map(mapTeamRowToEngine);
  const memberships = membershipRows.map(mapTeamMembershipRowToEngine);
  const skills = skillRows.map(mapSkillRowToEngine);
  const personSkills = personSkillRows.map(mapPersonSkillRowToEngine);
  const jrSkillRequirements = jrRequirementRows.map(
    mapJrSkillRequirementRowToEngine,
  );
  const workItems = workItemRows.map(mapWorkItemRowToEngine);
  const dependencies = dependencyRows.map(mapDependencyRowToEngine);
  const thresholdConfig = resolveConflictThresholds(settingRow?.value);

  const horizon = calculatePlanningHorizon(allocations);

  const ledger = buildCapacityLedger({
    people,
    allocations,
    ptoEntries,
    calendar,
    horizon,
  });

  if (ledger.length > 0) {
    const capacityStatements = ledger.map((row) =>
      db
        .prepare(
          `INSERT INTO capacity_entry
            (id, snapshot_id, week_key, person_id, gross_h, pto_h, overhead_h, available_h, planned_h, utilization, flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          snapshotId,
          row.week_key,
          row.person_id,
          row.gross_h,
          row.pto_h,
          row.overhead_h,
          row.available_h,
          row.planned_h,
          row.utilization,
          JSON.stringify(row.flags),
        ),
    );
    await db.batch(capacityStatements);
  }

  const feasibilityResults: FeasibilityResult[] = [];
  const feasibilityStatements: D1PreparedStatement[] = [];
  for (const project of projects) {
    const projectPhases = phases
      .filter((p) => p.project_id === project.id)
      .sort((a, b) => a.sequence - b.sequence);
    if (projectPhases.length === 0) continue;

    const result = computeFeasibility(
      buildFeasibilityInput({
        project,
        phases: projectPhases,
        allocations,
        people,
        dependencies,
        calendar,
      }),
    );
    feasibilityResults.push(result);

    const row = toFeasibilityResultPersistence(snapshotId, result);
    feasibilityStatements.push(
      db
        .prepare(
          `INSERT INTO feasibility_result
            (id, snapshot_id, project_id, computed_start, computed_finish, slack_days, buffer_days, verdict, drivers, critical_path, per_phase_load)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.snapshot_id,
          row.project_id,
          row.computed_start,
          row.computed_finish,
          row.slack_days,
          row.buffer_days,
          row.verdict,
          row.drivers,
          row.critical_path,
          row.per_phase_load,
        ),
    );
  }
  if (feasibilityStatements.length > 0) {
    await db.batch(feasibilityStatements);
  }

  const teamWeeks = rollupTeamCapacity({ ledger, teams, memberships });

  const conflicts = evaluateConflicts(
    buildConflictEngineInput({
      ledger,
      teamWeeks,
      people,
      teams,
      projects,
      phases,
      allocations,
      calendar,
      horizon,
      config: thresholdConfig,
      skills,
      personSkills,
      jrSkillRequirements,
      workItems,
      dependencies,
      teamMemberships: memberships,
      feasibilityResults,
    }),
  );

  if (conflicts.length > 0) {
    const conflictStatements = conflicts.map((c) =>
      db
        .prepare(
          `INSERT INTO conflict
            (id, snapshot_id, rule, severity, person_id, team_id, project_id, phase_id, window_start, window_end, metrics, explanation, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        )
        .bind(
          newId(),
          snapshotId,
          c.rule,
          c.severity,
          c.person_id ?? null,
          c.team_id ?? null,
          c.project_id ?? null,
          c.phase_id ?? null,
          c.window_start,
          c.window_end,
          JSON.stringify(c.metrics),
          c.explanation,
        ),
    );
    await db.batch(conflictStatements);
  }

  const previousLatest = await first<PlanningSnapshot>(
    db,
    "SELECT * FROM planning_snapshot ORDER BY created_at DESC LIMIT 1 OFFSET 1",
  );
  let resolved = 0;
  if (previousLatest) {
    const newKeys = new Set(conflicts.map(conflictKey));
    const oldOpen = await all<{
      id: string;
      rule: string;
      person_id: string | null;
      team_id: string | null;
      project_id: string | null;
      phase_id: string | null;
    }>(
      db,
      "SELECT id, rule, person_id, team_id, project_id, phase_id FROM conflict WHERE snapshot_id = ? AND status = 'open'",
      previousLatest.id,
    );
    const toResolve = oldOpen.filter(
      (c) =>
        !newKeys.has(
          conflictKey({
            rule: c.rule,
            person_id: c.person_id,
            team_id: c.team_id,
            project_id: c.project_id,
            phase_id: c.phase_id,
          }),
        ),
    );
    if (toResolve.length > 0) {
      const placeholders = toResolve.map(() => "?").join(", ");
      await run(
        db,
        `UPDATE conflict SET status = 'resolved', updated_at = ? WHERE id IN (${placeholders})`,
        nowIso(),
        ...toResolve.map((c) => c.id),
      );
      resolved = toResolve.length;
    }
  }

  return {
    capacity_entries: ledger.length,
    feasibility_results: feasibilityResults.length,
    conflicts: conflicts.length,
    resolved,
  };
}

export async function ensureCurrentSnapshot(
  db: D1Database,
): Promise<{
  snapshot: PlanningSnapshot;
  rebuilt: boolean;
  counts: Record<string, number>;
}> {
  const { fingerprint, counts: sourceCounts } =
    await computeInputsFingerprint(db);

  const latest = await first<PlanningSnapshot>(
    db,
    "SELECT * FROM planning_snapshot ORDER BY created_at DESC LIMIT 1",
  );

  let snapshot: PlanningSnapshot;
  let rebuilt = false;
  let resolved = 0;

  if (!latest || latest.inputs_hash !== fingerprint) {
    const existing = await first<PlanningSnapshot>(
      db,
      "SELECT * FROM planning_snapshot WHERE inputs_hash = ?",
      fingerprint,
    );
    const id = existing?.id ?? newId();
    if (existing) {
      await run(
        db,
        "UPDATE planning_snapshot SET created_at = ? WHERE id = ?",
        nowIso(),
        id,
      );
    } else {
      await run(
        db,
        "INSERT INTO planning_snapshot (id, created_at, inputs_hash) VALUES (?, ?, ?)",
        id,
        nowIso(),
        fingerprint,
      );
    }
    snapshot = (await first<PlanningSnapshot>(
      db,
      "SELECT * FROM planning_snapshot WHERE id = ?",
      id,
    ))!;
    rebuilt = true;
    const derivedCounts = await computeAndPersistDerived(db, snapshot.id);
    resolved = derivedCounts.resolved;
  } else {
    snapshot = latest;
    const [{ cnt }] = await all<{ cnt: number }>(
      db,
      "SELECT COUNT(*) AS cnt FROM capacity_entry WHERE snapshot_id = ?",
      snapshot.id,
    );
    if (cnt === 0) {
      const derivedCounts = await computeAndPersistDerived(db, snapshot.id);
      resolved = derivedCounts.resolved;
    }
  }

  const [{ capacity_entries }] = await all<{ capacity_entries: number }>(
    db,
    "SELECT COUNT(*) AS capacity_entries FROM capacity_entry WHERE snapshot_id = ?",
    snapshot.id,
  );
  const [{ conflicts }] = await all<{ conflicts: number }>(
    db,
    "SELECT COUNT(*) AS conflicts FROM conflict WHERE snapshot_id = ?",
    snapshot.id,
  );
  const [{ feasibility_results }] = await all<{ feasibility_results: number }>(
    db,
    "SELECT COUNT(*) AS feasibility_results FROM feasibility_result WHERE snapshot_id = ?",
    snapshot.id,
  );

  return {
    snapshot,
    rebuilt,
    counts: {
      ...sourceCounts,
      capacity_entries,
      feasibility_results,
      conflicts,
      resolved,
    },
  };
}
