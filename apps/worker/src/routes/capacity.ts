import { Hono } from "hono";
import { z } from "zod";
import type { CapacityWeekEntry } from "@kairo/types";
import { rollupTeamCapacity, rollupProjectDemand } from "@kairo/capacity-engine";
import { all, first } from "../db";
import { parseQuery } from "../http";
import {
  ensureCurrentSnapshot,
  getWeekRange,
  mapCapacityEntryRow,
  mapPersonRowToEngine,
  mapAllocationRowToEngine,
  mapProjectRowToEngine,
  mapTeamRowToEngine,
  mapTeamMembershipRowToEngine,
  loadOrgCalendar,
  filterByWeekRange,
  type TeamWeekEntry as EngineTeamWeekEntry,
  type ProjectWeekEntry as EngineProjectWeekEntry,
} from "../services/snapshot";

export type CapacityEntryWithName = CapacityWeekEntry & { person_name: string };
export type TeamCapacityEntryWithName = EngineTeamWeekEntry & { team_name: string };
export type ProjectCapacityEntryWithName = EngineProjectWeekEntry & { project_name: string };

const IsoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const CapacityQuerySchema = z.object({
  from: IsoDateStringSchema,
  to: IsoDateStringSchema,
  pivot: z.enum(["people", "teams", "projects"]).default("people"),
  team_id: z.string().optional(),
  person_id: z.string().optional(),
  project_id: z.string().optional(),
});

export const capacityRouter = new Hono();

capacityRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, CapacityQuerySchema as any) as {
    from?: string;
    to?: string;
    pivot: "people" | "teams" | "projects";
    team_id?: string;
    person_id?: string;
    project_id?: string;
  };

  const { snapshot } = await ensureCurrentSnapshot(db);
  const range = getWeekRange(query.from, query.to);

  let entries: unknown[] = [];

  if (query.pivot === "people") {
    entries = await loadPeopleCapacity(
      db,
      snapshot.id,
      range,
      query.person_id,
      query.team_id,
    );
  } else if (query.pivot === "teams") {
    entries = await loadTeamsCapacity(db, snapshot.id, range, query.team_id);
  } else {
    entries = await loadProjectsCapacity(
      db,
      snapshot.id,
      range,
      query.project_id,
    );
  }

  return c.json({
    snapshot: { id: snapshot.id, created_at: snapshot.created_at },
    entries,
  });
});

async function loadPeopleCapacity(
  db: D1Database,
  snapshotId: string,
  range: { fromKey: string; toKey: string },
  personId?: string,
  teamId?: string,
): Promise<CapacityEntryWithName[]> {
  const where: string[] = [
    "ce.snapshot_id = ?",
    "ce.week_key >= ?",
    "ce.week_key <= ?",
  ];
  const params: unknown[] = [snapshotId, range.fromKey, range.toKey];

  if (personId) {
    where.push("ce.person_id = ?");
    params.push(personId);
  }
  if (teamId) {
    where.push("tm.team_id = ?");
    params.push(teamId);
  }

  const joinTeam = teamId
    ? "INNER JOIN team_membership tm ON tm.person_id = ce.person_id"
    : "";

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT ce.*, p.name AS person_name
     FROM capacity_entry ce
     INNER JOIN person p ON ce.person_id = p.id
     ${joinTeam}
     WHERE ${where.join(" AND ")}
     ORDER BY ce.week_key, p.name`,
    ...params,
  );

  return rows.map((r) => ({
    ...mapCapacityEntryRow(r),
    person_name: r.person_name as string,
  }));
}

async function loadTeamsCapacity(
  db: D1Database,
  snapshotId: string,
  range: { fromKey: string; toKey: string; fromDate: string; toDate: string },
  teamId?: string,
): Promise<TeamCapacityEntryWithName[]> {
  const rawRows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM capacity_entry
     WHERE snapshot_id = ? AND week_key >= ? AND week_key <= ?
     ORDER BY week_key`,
    snapshotId,
    range.fromKey,
    range.toKey,
  );
  const ledger = rawRows.map(mapCapacityEntryRow);

  const teamRows = await all<Record<string, unknown>>(db, "SELECT * FROM team");
  const membershipRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM team_membership",
  );

  const teamWeeks = rollupTeamCapacity({
    ledger,
    teams: teamRows.map(mapTeamRowToEngine),
    memberships: membershipRows.map(mapTeamMembershipRowToEngine),
  });

  const teamsById = new Map(
    teamRows.map((r) => {
      const t = mapTeamRowToEngine(r);
      return [t.id, t.name] as const;
    }),
  );

  let result = teamWeeks.map((t) => ({
    ...t,
    team_name: teamsById.get(t.team_id) ?? t.team_id,
  }));

  if (teamId) {
    result = result.filter((t) => t.team_id === teamId);
  }

  return result;
}

async function loadProjectsCapacity(
  db: D1Database,
  _snapshotId: string,
  range: { fromDate: string; toDate: string },
  projectId?: string,
): Promise<ProjectCapacityEntryWithName[]> {
  const [allocationRows, personRows, projectRows] = await Promise.all([
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(db, "SELECT * FROM person WHERE active = 1"),
    all<Record<string, unknown>>(db, "SELECT * FROM project"),
  ]);

  const calendar = await loadOrgCalendar(db);

  const entries = rollupProjectDemand({
    allocations: allocationRows.map(mapAllocationRowToEngine),
    people: personRows.map(mapPersonRowToEngine),
    calendar,
    horizon: { from: range.fromDate, to: range.toDate },
  });

  const projectsById = new Map(
    projectRows.map((r) => {
      const p = mapProjectRowToEngine(r);
      return [p.id, p.name] as const;
    }),
  );

  let result = entries.map((e) => ({
    ...e,
    project_name: projectsById.get(e.project_id) ?? e.project_id,
  }));

  if (projectId) {
    result = result.filter((e) => e.project_id === projectId);
  }

  return result;
}
