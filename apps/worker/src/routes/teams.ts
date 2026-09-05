import { Hono } from "hono";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody } from "../http";
import {
  AddTeamMemberSchema,
  buildTeamWithMembers,
  CreateTeamSchema,
  mapTeamRow,
  type TeamWithMembers,
  UpdateTeamSchema,
} from "../schemas/teams";

async function loadTeamById(db: D1Database, id: string): Promise<TeamWithMembers | null> {
  const row = await first<Record<string, unknown>>(db, "SELECT * FROM team WHERE id = ?", id);
  if (!row) return null;
  const members = await all<{ person_id: string }>(
    db,
    "SELECT person_id FROM team_membership WHERE team_id = ?",
    id,
  );
  return buildTeamWithMembers(mapTeamRow(row), members.map((m) => m.person_id));
}

async function loadAllTeamsWithMembers(db: D1Database): Promise<TeamWithMembers[]> {
  const teamRows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM team ORDER BY name",
  );
  const membershipRows = await all<{ team_id: string; person_id: string }>(
    db,
    "SELECT team_id, person_id FROM team_membership",
  );
  const membersByTeam = new Map<string, string[]>();
  for (const m of membershipRows) {
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m.person_id);
    membersByTeam.set(m.team_id, list);
  }
  return teamRows.map((row) => {
    const team = mapTeamRow(row);
    const memberIds = membersByTeam.get(team.id) ?? [];
    return buildTeamWithMembers(team, memberIds);
  });
}

export const teamsRouter = new Hono();

teamsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  return c.json(await loadAllTeamsWithMembers(db));
});

teamsRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateTeamSchema);
  const id = newId();
  const now = nowIso();
  await run(
    db,
    "INSERT INTO team (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    body.name,
    body.type,
    now,
    now,
  );
  const team = await loadTeamById(db, id);
  return c.json(team!);
});

teamsRouter.patch("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = await parseBody(c, UpdateTeamSchema);

  const existing = await first<{ id: string }>(db, "SELECT id FROM team WHERE id = ?", id);
  if (!existing) notFound("Team not found");

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    sets.push("name = ?");
    values.push(body.name);
  }
  if (body.type !== undefined) {
    sets.push("type = ?");
    values.push(body.type);
  }

  if (sets.length > 0) {
    sets.push("updated_at = ?");
    values.push(nowIso());
    values.push(id);
    await run(db, `UPDATE team SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }

  const team = await loadTeamById(db, id);
  return c.json(team!);
});

teamsRouter.post("/:id/members", async (c) => {
  const db = c.get("db") as D1Database;
  const teamId = c.req.param("id");
  const body = await parseBody(c, AddTeamMemberSchema);

  const team = await first<{ id: string }>(db, "SELECT id FROM team WHERE id = ?", teamId);
  if (!team) notFound("Team not found");

  const person = await first<{ id: string }>(
    db,
    "SELECT id FROM person WHERE id = ?",
    body.person_id,
  );
  if (!person) badRequest("Person not found");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM team_membership WHERE person_id = ? AND team_id = ?",
    body.person_id,
    teamId,
  );
  if (existing) badRequest("Person is already a member of this team");

  await run(
    db,
    "INSERT INTO team_membership (id, person_id, team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    newId(),
    body.person_id,
    teamId,
    nowIso(),
    nowIso(),
  );

  const updated = await loadTeamById(db, teamId);
  return c.json(updated!);
});

teamsRouter.delete("/:id/members/:personId", async (c) => {
  const db = c.get("db") as D1Database;
  const teamId = c.req.param("id");
  const personId = c.req.param("personId");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM team_membership WHERE person_id = ? AND team_id = ?",
    personId,
    teamId,
  );
  if (!existing) notFound("Membership not found");

  await run(
    db,
    "DELETE FROM team_membership WHERE person_id = ? AND team_id = ?",
    personId,
    teamId,
  );
  return c.body(null, 204);
});
