import { Hono } from "hono";
import { all, first, newId, nowIso, run } from "../db";
import { notFound, parseBody, parseQuery } from "../http";
import {
  CreateDependencySchema,
  DependencyQuerySchema,
  mapDependencyRow,
} from "../schemas/dependencies";

export const dependenciesRouter = new Hono();

dependenciesRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, DependencyQuerySchema);

  if (query.project_id) {
    const rows = await all<Record<string, unknown>>(
      db,
      `SELECT * FROM dependency
       WHERE from_project_id = ? OR to_project_id = ?
       ORDER BY created_at`,
      query.project_id,
      query.project_id,
    );
    return c.json(rows.map(mapDependencyRow));
  }

  const rows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM dependency ORDER BY created_at",
  );
  return c.json(rows.map(mapDependencyRow));
});

dependenciesRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateDependencySchema);

  const id = newId();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO dependency
      (id, from_project_id, from_phase_id, to_project_id, to_phase_id, type, lag_days, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.from_project_id ?? null,
    body.from_phase_id ?? null,
    body.to_project_id ?? null,
    body.to_phase_id ?? null,
    body.type,
    body.lag_days,
    body.source,
    now,
    now,
  );

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM dependency WHERE id = ?",
    id,
  );
  return c.json(mapDependencyRow(row!), 201);
});

dependenciesRouter.delete("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM dependency WHERE id = ?",
    id,
  );
  if (!existing) notFound("Dependency not found");

  await run(db, "DELETE FROM dependency WHERE id = ?", id);
  return c.body(null, 204);
});
