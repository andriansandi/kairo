import { Hono } from "hono";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody } from "../http";
import {
  CreateRoleSchema,
  mapRoleRow,
  UpdateRoleSchema,
} from "../schemas/roles";

export const rolesRouter = new Hono();

rolesRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const rows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM role ORDER BY name",
  );
  return c.json(rows.map(mapRoleRow));
});

rolesRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateRoleSchema);
  const id = newId();
  const now = nowIso();
  await run(
    db,
    "INSERT INTO role (id, name, seniority_ladder, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    body.name,
    JSON.stringify(body.seniority_ladder),
    now,
    now,
  );
  const row = await first<Record<string, unknown>>(db, "SELECT * FROM role WHERE id = ?", id);
  return c.json(mapRoleRow(row!));
});

rolesRouter.patch("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = await parseBody(c, UpdateRoleSchema);

  const existing = await first<{ id: string }>(db, "SELECT id FROM role WHERE id = ?", id);
  if (!existing) notFound("Role not found");

  const sets: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    sets.push("name = ?");
    values.push(body.name);
  }
  if (body.seniority_ladder !== undefined) {
    sets.push("seniority_ladder = ?");
    values.push(JSON.stringify(body.seniority_ladder));
  }
  if (sets.length === 0) {
    const row = await first<Record<string, unknown>>(db, "SELECT * FROM role WHERE id = ?", id);
    return c.json(mapRoleRow(row!));
  }

  sets.push("updated_at = ?");
  values.push(nowIso());
  values.push(id);

  await run(
    db,
    `UPDATE role SET ${sets.join(", ")} WHERE id = ?`,
    ...values,
  );
  const row = await first<Record<string, unknown>>(db, "SELECT * FROM role WHERE id = ?", id);
  return c.json(mapRoleRow(row!));
});
