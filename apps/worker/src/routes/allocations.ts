import { Hono } from "hono";
import { all, first, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody, parseQuery } from "../http";
import {
  CreateAllocationSchema,
  mapAllocationRow,
  UpdateAllocationSchema,
  validateAllocationDates,
  AllocationListQuerySchema,
} from "../schemas/allocations";
import { decodeCursor, nextCursor, slicePage } from "../schemas/common";

export const allocationsRouter = new Hono();

allocationsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, AllocationListQuerySchema as any) as {
    limit: number;
    cursor?: string;
    person_id?: string;
    project_id?: string;
    from?: string;
    to?: string;
  };
  const offset = decodeCursor(query.cursor);

  const where: string[] = [];
  const params: unknown[] = [];

  if (query.person_id) {
    where.push("person_id = ?");
    params.push(query.person_id);
  }
  if (query.project_id) {
    where.push("project_id = ?");
    params.push(query.project_id);
  }
  if (query.from || query.to) {
    const from = query.from ?? "0000-01-01";
    const to = query.to ?? "9999-12-31";
    where.push("start_date <= ? AND end_date >= ?");
    params.push(to, from);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM allocation ${whereClause} ORDER BY start_date DESC LIMIT ? OFFSET ?`,
    ...params,
    query.limit + 1,
    offset,
  );

  const page = slicePage(rows, query.limit);
  return c.json({ items: page.map(mapAllocationRow), nextCursor: nextCursor(rows, query.limit, offset) });
});

allocationsRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateAllocationSchema);

  validateAllocationDates(body.start_date, body.end_date);

  const person = await first<{ id: string }>(
    db,
    "SELECT id FROM person WHERE id = ?",
    body.person_id,
  );
  if (!person) badRequest("Person not found");

  const project = await first<{ id: string }>(
    db,
    "SELECT id FROM project WHERE id = ?",
    body.project_id,
  );
  if (!project) badRequest("Project not found");

  if (body.phase_id) {
    const phase = await first<{ id: string }>(
      db,
      "SELECT id FROM phase WHERE id = ? AND project_id = ?",
      body.phase_id,
      body.project_id,
    );
    if (!phase) badRequest("Phase not found or does not belong to project");
  }

  const id = newId();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO allocation
      (id, person_id, project_id, phase_id, fte, start_date, end_date, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.person_id,
    body.project_id,
    body.phase_id ?? null,
    body.fte,
    body.start_date,
    body.end_date,
    body.status,
    body.source,
    now,
    now,
  );

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM allocation WHERE id = ?",
    id,
  );
  return c.json(mapAllocationRow(row!), 201);
});

allocationsRouter.patch("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");
  const body = await parseBody(c, UpdateAllocationSchema);

  const existing = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM allocation WHERE id = ?",
    id,
  );
  if (!existing) notFound("Allocation not found");

  const start = body.start_date ?? (existing.start_date as string);
  const end = body.end_date ?? (existing.end_date as string);
  validateAllocationDates(start, end);

  if (body.person_id !== undefined) {
    const person = await first<{ id: string }>(
      db,
      "SELECT id FROM person WHERE id = ?",
      body.person_id,
    );
    if (!person) badRequest("Person not found");
  }

  if (body.project_id !== undefined) {
    const project = await first<{ id: string }>(
      db,
      "SELECT id FROM project WHERE id = ?",
      body.project_id,
    );
    if (!project) badRequest("Project not found");
  }

  if (body.phase_id !== undefined && body.phase_id !== null) {
    const projectId = body.project_id ?? (existing.project_id as string);
    const phase = await first<{ id: string }>(
      db,
      "SELECT id FROM phase WHERE id = ? AND project_id = ?",
      body.phase_id,
      projectId,
    );
    if (!phase) badRequest("Phase not found or does not belong to project");
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  const maybeSet = (col: string, val: unknown) => {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      values.push(val);
    }
  };

  maybeSet("person_id", body.person_id);
  maybeSet("project_id", body.project_id);
  if (body.phase_id !== undefined) {
    sets.push("phase_id = ?");
    values.push(body.phase_id ?? null);
  }
  maybeSet("fte", body.fte);
  maybeSet("start_date", body.start_date);
  maybeSet("end_date", body.end_date);
  maybeSet("status", body.status);
  maybeSet("source", body.source);

  if (sets.length > 0) {
    sets.push("updated_at = ?");
    values.push(nowIso());
    values.push(id);
    await run(db, `UPDATE allocation SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM allocation WHERE id = ?",
    id,
  );
  return c.json(mapAllocationRow(row!));
});

allocationsRouter.delete("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM allocation WHERE id = ?",
    id,
  );
  if (!existing) notFound("Allocation not found");

  await run(db, "DELETE FROM allocation WHERE id = ?", id);
  return c.body(null, 204);
});
