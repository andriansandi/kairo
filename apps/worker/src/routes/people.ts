import { Hono } from "hono";
import { z } from "zod";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody, parseQuery } from "../http";
import { decodeCursor, nextCursor, slicePage } from "../schemas/common";
import {
  CreatePersonSchema,
  mapAllocationRow,
  mapPersonRow,
  mapPersonSkillRow,
  mapPersonWithRefs,
  mapPtoRow,
  mapTeamRow,
  PersonListQuerySchema,
  PtoCreateSchema,
  PutPersonSkillsSchema,
  UpdatePersonSchema,
  type PersonWithRefs,
} from "../schemas/people";

async function loadRoleName(db: D1Database, roleId: string): Promise<string | null> {
  const row = await first<{ name: string }>(
    db,
    "SELECT name FROM role WHERE id = ?",
    roleId,
  );
  return row?.name ?? null;
}

async function teamsForPersonIds(
  db: D1Database,
  personIds: string[],
): Promise<Map<string, string[]>> {
  if (personIds.length === 0) return new Map();
  const placeholders = personIds.map(() => "?").join(", ");
  const rows = await all<{ person_id: string; team_id: string }>(
    db,
    `SELECT person_id, team_id FROM team_membership WHERE person_id IN (${placeholders})`,
    ...personIds,
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.person_id) ?? [];
    list.push(r.team_id);
    map.set(r.person_id, list);
  }
  return map;
}

async function listPeopleWithRefs(
  db: D1Database,
  query: { q?: string; active?: boolean; limit: number; cursor?: string },
): Promise<{ items: PersonWithRefs[]; nextCursor: string | null }> {
  const offset = decodeCursor(query.cursor);
  const params: unknown[] = [];
  const where: string[] = [];

  if (query.q) {
    where.push("(p.name LIKE '%' || ? || '%' OR p.email LIKE '%' || ? || '%')");
    params.push(query.q, query.q);
  }
  if (query.active !== undefined) {
    where.push("p.active = ?");
    params.push(query.active ? 1 : 0);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT p.*, r.name AS role_name
     FROM person p
     LEFT JOIN role r ON p.role_id = r.id
     ${whereClause}
     ORDER BY p.name
     LIMIT ? OFFSET ?`,
    ...params,
    query.limit + 1,
    offset,
  );

  const page = slicePage(rows, query.limit);
  const personIds = page.map((r) => r.id as string);
  const teamsMap = await teamsForPersonIds(db, personIds);

  const items = page.map((r) => {
    const person = mapPersonRow(r);
    const roleName = (r.role_name as string) ?? "";
    const teamIds = teamsMap.get(person.id) ?? [];
    return mapPersonWithRefs(person, roleName, teamIds);
  });

  return { items, nextCursor: nextCursor(rows, query.limit, offset) };
}

async function loadPersonDetail(db: D1Database, id: string) {
  const row = await first<Record<string, unknown>>(
    db,
    `SELECT p.*, r.name AS role_name
     FROM person p
     LEFT JOIN role r ON p.role_id = r.id
     WHERE p.id = ?`,
    id,
  );
  if (!row) return null;

  const person = mapPersonRow(row);
  const roleName = (row.role_name as string) ?? "";

  const [skillRows, allocationRows, teamRows, ptoRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      "SELECT ps.* FROM person_skill ps WHERE ps.person_id = ?",
      id,
    ),
    all<Record<string, unknown>>(
      db,
      "SELECT a.* FROM allocation a WHERE a.person_id = ? ORDER BY a.start_date",
      id,
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT t.* FROM team t
       INNER JOIN team_membership tm ON t.id = tm.team_id
       WHERE tm.person_id = ?
       ORDER BY t.name`,
      id,
    ),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM pto_entry WHERE person_id = ? ORDER BY dates",
      id,
    ),
  ]);

  return {
    person: mapPersonWithRefs(
      person,
      roleName,
      teamRows.map((t) => mapTeamRow(t).id),
    ),
    skills: skillRows.map(mapPersonSkillRow),
    allocations: allocationRows.map(mapAllocationRow),
    teams: teamRows.map(mapTeamRow),
    pto: ptoRows.map(mapPtoRow),
  };
}

export const peopleRouter = new Hono();

peopleRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, PersonListQuerySchema as any) as {
    limit: number;
    cursor?: string;
    q?: string;
    active?: boolean;
  };
  const result = await listPeopleWithRefs(db, query);
  return c.json(result);
});

peopleRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = (await parseBody(c, CreatePersonSchema)) as z.infer<typeof CreatePersonSchema>;

  const existingEmail = await first<{ id: string }>(
    db,
    "SELECT id FROM person WHERE email = ?",
    body.email,
  );
  if (existingEmail) badRequest("Email already exists");

  const role = await first<{ id: string }>(db, "SELECT id FROM role WHERE id = ?", body.role_id);
  if (!role) badRequest("Role not found");

  const id = newId();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO person
      (id, name, email, role_id, seniority, hours_per_day, overhead_pct, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.name,
    body.email,
    body.role_id,
    body.seniority,
    body.hours_per_day,
    body.overhead_pct,
    body.active ? 1 : 0,
    now,
    now,
  );

  const row = await first<Record<string, unknown>>(db, "SELECT * FROM person WHERE id = ?", id);
  return c.json(mapPersonRow(row!));
});

peopleRouter.get("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const detail = await loadPersonDetail(db, id);
  if (!detail) notFound("Person not found");
  return c.json(detail);
});

peopleRouter.patch("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = (await parseBody(c, UpdatePersonSchema)) as z.infer<typeof UpdatePersonSchema>;

  const existing = await first<{ id: string }>(db, "SELECT id FROM person WHERE id = ?", id);
  if (!existing) notFound("Person not found");

  if (body.email) {
    const duplicate = await first<{ id: string }>(
      db,
      "SELECT id FROM person WHERE email = ? AND id != ?",
      body.email,
      id,
    );
    if (duplicate) badRequest("Email already exists");
  }

  if (body.role_id) {
    const role = await first<{ id: string }>(
      db,
      "SELECT id FROM role WHERE id = ?",
      body.role_id,
    );
    if (!role) badRequest("Role not found");
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  const maybeSet = (col: string, val: unknown) => {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      values.push(val);
    }
  };

  maybeSet("name", body.name);
  maybeSet("email", body.email);
  maybeSet("role_id", body.role_id);
  maybeSet("seniority", body.seniority);
  maybeSet("hours_per_day", body.hours_per_day);
  maybeSet("overhead_pct", body.overhead_pct);
  if (body.active !== undefined) {
    sets.push("active = ?");
    values.push(body.active ? 1 : 0);
  }

  if (sets.length > 0) {
    sets.push("updated_at = ?");
    values.push(nowIso());
    values.push(id);
    await run(db, `UPDATE person SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }

  const row = await first<Record<string, unknown>>(db, "SELECT * FROM person WHERE id = ?", id);
  return c.json(mapPersonRow(row!));
});

peopleRouter.put("/:id/skills", async (c) => {
  const db = c.get("db") as D1Database;
  const personId = c.req.param("id");
  const body = (await parseBody(c, PutPersonSkillsSchema)) as z.infer<typeof PutPersonSkillsSchema>;

  const person = await first<{ id: string }>(
    db,
    "SELECT id FROM person WHERE id = ?",
    personId,
  );
  if (!person) notFound("Person not found");

  if (body.skills.length > 0) {
    const skillIds = [...new Set(body.skills.map((s) => s.skill_id))];
    const placeholders = skillIds.map(() => "?").join(", ");
    const found = await all<{ id: string }>(
      db,
      `SELECT id FROM skill WHERE id IN (${placeholders})`,
      ...skillIds,
    );
    const foundSet = new Set(found.map((r) => r.id));
    const missing = skillIds.find((sid) => !foundSet.has(sid));
    if (missing) badRequest(`Skill not found: ${missing}`);
  }

  const now = nowIso();
  const statements: D1PreparedStatement[] = [];

  statements.push(
    db.prepare("DELETE FROM person_skill WHERE person_id = ?").bind(personId),
  );

  for (const s of body.skills) {
    statements.push(
      db
        .prepare(
          "INSERT INTO person_skill (id, person_id, skill_id, level, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          newId(),
          personId,
          s.skill_id,
          s.level,
          s.source,
          now,
          now,
        ),
    );
  }

  await db.batch(statements);

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM person WHERE id = ?",
    personId,
  );
  return c.json(mapPersonRow(row!));
});

peopleRouter.post("/:id/pto", async (c) => {
  const db = c.get("db") as D1Database;
  const personId = c.req.param("id");
  const body = (await parseBody(c, PtoCreateSchema)) as z.infer<typeof PtoCreateSchema>;

  const person = await first<{ id: string }>(
    db,
    "SELECT id FROM person WHERE id = ?",
    personId,
  );
  if (!person) notFound("Person not found");

  if (body.end_date < body.start_date) {
    badRequest("end_date must be on or after start_date");
  }

  const id = newId();
  const now = nowIso();
  await run(
    db,
    "INSERT INTO pto_entry (id, person_id, dates, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    personId,
    JSON.stringify([body.start_date, body.end_date]),
    body.type,
    now,
    now,
  );

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM pto_entry WHERE id = ?",
    id,
  );
  return c.json(mapPtoRow(row!), 201);
});

peopleRouter.delete("/:id/pto/:ptoId", async (c) => {
  const db = c.get("db") as D1Database;
  const personId = c.req.param("id");
  const ptoId = c.req.param("ptoId");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM pto_entry WHERE id = ? AND person_id = ?",
    ptoId,
    personId,
  );
  if (!existing) notFound("PTO entry not found");

  await run(db, "DELETE FROM pto_entry WHERE id = ?", ptoId);
  return c.body(null, 204);
});
