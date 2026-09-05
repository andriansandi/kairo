import { Hono } from "hono";
import { z } from "zod";
import type { Conflict } from "@kairo/types";
import { all, first, run } from "../db";
import { badRequest, notFound, parseQuery } from "../http";
import { decodeCursor, encodeCursor, slicePage } from "../schemas/common";
import { ensureCurrentSnapshot } from "../services/snapshot";

const ConflictStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
const ConflictSeveritySchema = z.enum(["warning", "at_risk", "critical"]);
const ConflictRuleSchema = z.enum([
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
]);

const ConflictListQuerySchema = z.object({
  severity: ConflictSeveritySchema.optional(),
  rule: ConflictRuleSchema.optional(),
  project_id: z.string().optional(),
  status: ConflictStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type ConflictView = Conflict & {
  person_name: string | null;
  team_name: string | null;
  project_name: string | null;
  phase_name: string | null;
};

export const conflictsRouter = new Hono();

conflictsRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const query = parseQuery(c, ConflictListQuerySchema as any) as {
    severity?: "warning" | "at_risk" | "critical";
    rule?:
      | "C1"
      | "C2"
      | "C3"
      | "C4"
      | "C5"
      | "C6"
      | "C7"
      | "C8"
      | "C9"
      | "C10";
    project_id?: string;
    status?: "open" | "acknowledged" | "resolved";
    limit: number;
    cursor?: string;
  };

  const { snapshot } = await ensureCurrentSnapshot(db);
  const offset = decodeCursor(query.cursor);

  const where: string[] = ["c.snapshot_id = ?"];
  const params: unknown[] = [snapshot.id];

  if (query.status) {
    where.push("c.status = ?");
    params.push(query.status);
  } else {
    where.push("c.status IN ('open', 'acknowledged')");
  }

  if (query.severity) {
    where.push("c.severity = ?");
    params.push(query.severity);
  }
  if (query.rule) {
    where.push("c.rule = ?");
    params.push(query.rule);
  }
  if (query.project_id) {
    where.push("c.project_id = ?");
    params.push(query.project_id);
  }

  const orderBy = `
    CASE c.severity
      WHEN 'critical' THEN 0
      WHEN 'at_risk' THEN 1
      WHEN 'warning' THEN 2
      ELSE 3
    END ASC,
    c.rule ASC,
    c.id ASC
  `;

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT c.*,
            p.name AS person_name,
            t.name AS team_name,
            pr.name AS project_name,
            ph.name AS phase_name
     FROM conflict c
     LEFT JOIN person p ON c.person_id = p.id
     LEFT JOIN team t ON c.team_id = t.id
     LEFT JOIN project pr ON c.project_id = pr.id
     LEFT JOIN phase ph ON c.phase_id = ph.id
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    ...params,
    query.limit + 1,
    offset,
  );

  const page = slicePage(rows, query.limit);
  const items: ConflictView[] = page.map(mapConflictRow);
  const nextCursor =
    rows.length > query.limit ? encodeCursor(offset + query.limit) : null;

  return c.json({ items, nextCursor });
});

conflictsRouter.get("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const row = await first<Record<string, unknown>>(
    db,
    `SELECT c.*,
            p.name AS person_name,
            t.name AS team_name,
            pr.name AS project_name,
            ph.name AS phase_name
     FROM conflict c
     LEFT JOIN person p ON c.person_id = p.id
     LEFT JOIN team t ON c.team_id = t.id
     LEFT JOIN project pr ON c.project_id = pr.id
     LEFT JOIN phase ph ON c.phase_id = ph.id
     WHERE c.id = ?`,
    id,
  );

  if (!row) notFound("Conflict not found");
  return c.json(mapConflictRow(row));
});

conflictsRouter.post("/:id/acknowledge", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const existing = await first<{ status: string }>(
    db,
    "SELECT status FROM conflict WHERE id = ?",
    id,
  );
  if (!existing) notFound("Conflict not found");
  if (existing.status !== "open") badRequest("Conflict is not open");

  await run(
    db,
    "UPDATE conflict SET status = 'acknowledged' WHERE id = ?",
    id,
  );

  const row = await first<Record<string, unknown>>(
    db,
    `SELECT c.*,
            p.name AS person_name,
            t.name AS team_name,
            pr.name AS project_name,
            ph.name AS phase_name
     FROM conflict c
     LEFT JOIN person p ON c.person_id = p.id
     LEFT JOIN team t ON c.team_id = t.id
     LEFT JOIN project pr ON c.project_id = pr.id
     LEFT JOIN phase ph ON c.phase_id = ph.id
     WHERE c.id = ?`,
    id,
  );

  return c.json(mapConflictRow(row!));
});

export function mapConflictRow(row: Record<string, unknown>): ConflictView {
  return {
    id: row.id as string,
    snapshot_id: row.snapshot_id as string,
    rule: row.rule as Conflict["rule"],
    severity: row.severity as Conflict["severity"],
    person_id: (row.person_id as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    phase_id: (row.phase_id as string | null) ?? null,
    window_start: row.window_start as string,
    window_end: row.window_end as string,
    metrics: JSON.parse((row.metrics as string) || "{}"),
    explanation: row.explanation as string,
    status: row.status as Conflict["status"],
    person_name: (row.person_name as string | null) ?? null,
    team_name: (row.team_name as string | null) ?? null,
    project_name: (row.project_name as string | null) ?? null,
    phase_name: (row.phase_name as string | null) ?? null,
  };
}
