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
} from "@kairo/types";
import {
  buildCapacityLedger,
  rollupTeamCapacity,
  rollupProjectDemand,
  MAX_UTILIZATION_SENTINEL,
  type TeamWeekEntry,
  type ProjectWeekEntry,
} from "@kairo/capacity-engine";
import {
  evaluateConflicts,
  type EngineConflict,
  DEFAULT_CONFLICT_THRESHOLDS,
} from "@kairo/conflict-engine";
import { weekStart, isoWeekKey } from "@kairo/calendar";
import { all, first, newId, nowIso, run, fromJson } from "../db";

export { MAX_UTILIZATION_SENTINEL, DEFAULT_CONFLICT_THRESHOLDS };
export type { TeamWeekEntry, ProjectWeekEntry, EngineConflict };

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

export async function loadOrgCalendar(db: D1Database): Promise<OrgCalendar> {
  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM org_calendar LIMIT 1",
  );
  return parseOrgCalendarRow(row);
}

export interface DerivedCounts {
  capacity_entries: number;
  conflicts: number;
  resolved: number;
}

export async function computeAndPersistDerived(
  db: D1Database,
  snapshotId: string,
): Promise<DerivedCounts> {
  await run(db, "DELETE FROM capacity_entry WHERE snapshot_id = ?", snapshotId);
  await run(db, "DELETE FROM conflict WHERE snapshot_id = ?", snapshotId);

  const [
    personRows,
    allocationRows,
    ptoRows,
    calendarRow,
    projectRows,
    phaseRows,
    teamRows,
    membershipRows,
  ] = await Promise.all([
    all<Record<string, unknown>>(db, "SELECT * FROM person"),
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(db, "SELECT * FROM pto_entry"),
    first<Record<string, unknown>>(db, "SELECT * FROM org_calendar LIMIT 1"),
    all<Record<string, unknown>>(db, "SELECT * FROM project"),
    all<Record<string, unknown>>(db, "SELECT * FROM phase"),
    all<Record<string, unknown>>(db, "SELECT * FROM team"),
    all<Record<string, unknown>>(db, "SELECT * FROM team_membership"),
  ]);

  const people = personRows.map(mapPersonRowToEngine);
  const allocations = allocationRows.map(mapAllocationRowToEngine);
  const ptoEntries = ptoRows.map(mapPtoRowToEngine);
  const calendar = parseOrgCalendarRow(calendarRow);
  const projects = projectRows.map(mapProjectRowToEngine);
  const phases = phaseRows.map(mapPhaseRowToEngine);
  const teams = teamRows.map(mapTeamRowToEngine);
  const memberships = membershipRows.map(mapTeamMembershipRowToEngine);

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

  const teamWeeks = rollupTeamCapacity({ ledger, teams, memberships });

  const conflicts = evaluateConflicts({
    ledger,
    teamWeeks,
    people,
    teams,
    projects,
    phases,
    allocations,
    calendar,
    horizon,
    config: DEFAULT_CONFLICT_THRESHOLDS,
  });

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
        `UPDATE conflict SET status = 'resolved' WHERE id IN (${placeholders})`,
        ...toResolve.map((c) => c.id),
      );
      resolved = toResolve.length;
    }
  }

  return {
    capacity_entries: ledger.length,
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
    // A->B->A pattern: the input state may match an OLDER snapshot. inputs_hash
    // is UNIQUE, so a fresh INSERT would violate the constraint — reuse the
    // existing row, bump created_at so it becomes current again, and rebuild
    // its derived rows (computeAndPersistDerived clears them for this id first).
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

  return {
    snapshot,
    rebuilt,
    counts: { ...sourceCounts, capacity_entries, conflicts, resolved },
  };
}
