import { Hono } from "hono";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody, parseQuery } from "../http";
import { computeSkillCoverage, type SkillCoverage } from "@kairo/matching-engine";
import {
  ensureCurrentSnapshot,
  mapCapacityEntryRow,
  mapPersonRowToEngine,
  mapPersonSkillRowToEngine,
  mapSkillRowToEngine,
} from "../services/snapshot";
import {
  CreateSkillSchema,
  mapSkillRow,
  SkillQuerySchema,
  UpdateSkillSchema,
} from "../schemas/skills";

export const skillsRouter = new Hono();

skillsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, SkillQuerySchema);

  let sql = "SELECT * FROM skill";
  const params: unknown[] = [];

  if (query.q) {
    sql += " WHERE name LIKE ? OR category LIKE ?";
    params.push(`%${query.q}%`, `%${query.q}%`);
  }

  sql += " ORDER BY name";
  const rows = await all<Record<string, unknown>>(db, sql, ...params);
  return c.json(rows.map(mapSkillRow));
});

skillsRouter.get("/coverage", async (c) => {
  const db = c.get("db") as D1Database;
  const { snapshot } = await ensureCurrentSnapshot(db);

  const [skillRows, personRows, personSkillRows, ledgerRows] = await Promise.all([
    all<Record<string, unknown>>(db, "SELECT * FROM skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM person"),
    all<Record<string, unknown>>(db, "SELECT * FROM person_skill"),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM capacity_entry WHERE snapshot_id = ?",
      snapshot.id,
    ),
  ]);

  const skills = skillRows.map(mapSkillRowToEngine);
  const people = personRows.map(mapPersonRowToEngine);
  const personSkills = personSkillRows.map(mapPersonSkillRowToEngine);
  const ledger = ledgerRows.map(mapCapacityEntryRow);

  const coverage: SkillCoverage[] = computeSkillCoverage({
    skills,
    people,
    personSkills,
    ledger,
  });

  return c.json({ coverage });
});

skillsRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateSkillSchema);

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM skill WHERE name = ?",
    body.name,
  );
  if (existing) badRequest("Skill name already exists");

  const id = newId();
  const now = nowIso();
  await run(
    db,
    "INSERT INTO skill (id, name, category, aliases, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    body.name,
    body.category,
    JSON.stringify(body.aliases),
    now,
    now,
  );
  const row = await first<Record<string, unknown>>(db, "SELECT * FROM skill WHERE id = ?", id);
  return c.json(mapSkillRow(row!));
});

skillsRouter.patch("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = await parseBody(c, UpdateSkillSchema);

  const existing = await first<{ id: string }>(db, "SELECT id FROM skill WHERE id = ?", id);
  if (!existing) notFound("Skill not found");

  if (body.name !== undefined) {
    const duplicate = await first<{ id: string }>(
      db,
      "SELECT id FROM skill WHERE name = ? AND id != ?",
      body.name,
      id,
    );
    if (duplicate) badRequest("Skill name already exists");
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    sets.push("name = ?");
    values.push(body.name);
  }
  if (body.category !== undefined) {
    sets.push("category = ?");
    values.push(body.category);
  }
  if (body.aliases !== undefined) {
    sets.push("aliases = ?");
    values.push(JSON.stringify(body.aliases));
  }
  if (sets.length === 0) {
    const row = await first<Record<string, unknown>>(db, "SELECT * FROM skill WHERE id = ?", id);
    return c.json(mapSkillRow(row!));
  }

  sets.push("updated_at = ?");
  values.push(nowIso());
  values.push(id);

  await run(db, `UPDATE skill SET ${sets.join(", ")} WHERE id = ?`, ...values);
  const row = await first<Record<string, unknown>>(db, "SELECT * FROM skill WHERE id = ?", id);
  return c.json(mapSkillRow(row!));
});
