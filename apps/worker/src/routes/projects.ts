import { Hono } from "hono";
import { z } from "zod";
import { parseBody, parseQuery, badRequest } from "../http";
import { all, first, run } from "../db";
import type { Project, ProjectPhase } from "@kairo/types";
import {
  computeFeasibility,
  generateAlternatives,
  type FeasibilityInput,
  type Alternative,
  type FeasibilityResult,
} from "@kairo/planning-engine";
import {
  ensureCurrentSnapshot,
  buildFeasibilityInput,
  mapProjectRowToEngine,
  mapPhaseRowToEngine,
  mapAllocationRowToEngine,
  mapPersonRowToEngine,
  mapDependencyRowToEngine,
  mapWorkItemRowToEngine,
  parseOrgCalendarRow,
  mapCapacityEntryRow,
  mapFeasibilityResultRow,
  personFreeHoursFromLedger,
} from "../services/snapshot";

const ProjectStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

const ListQuerySchema = z.object({
  q: z.string().optional(),
  status: ProjectStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Note: Plane sync only overwrites name and dates. Priority is KAIRO-managed.
const PatchBodySchema = z.object({
  priority: z.number().int().min(0).max(10).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  declared_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  declared_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: ProjectStatusSchema.optional(),
});

function decodeCursor(cursor?: string): { updatedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(atob(cursor));
    if (
      typeof decoded.updatedAt === "string" &&
      typeof decoded.id === "string"
    ) {
      return decoded;
    }
  } catch {
    // ignore invalid cursor
  }
  return null;
}

function encodeCursor(updatedAt: string, id: string): string {
  return btoa(JSON.stringify({ updatedAt, id }));
}

export const projectsRouter = new Hono();

projectsRouter.get("/", async (c) => {
  const db = c.get("db");
  const { q, status, limit, cursor } = parseQuery(c, ListQuerySchema);
  const decoded = decodeCursor(cursor);

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  if (q) {
    conditions.push("(p.name LIKE ? OR p.code LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (decoded) {
    conditions.push("(p.updated_at < ? OR (p.updated_at = ? AND p.id > ?))");
    params.push(decoded.updatedAt, decoded.updatedAt, decoded.id);
  }

  const where = conditions.join(" AND ");
  const pageLimit = limit ?? 50;
  const projectRows = await all<
    Project & { work_item_count: number; feasibility_verdict: string | null }
  >(
    db,
    `SELECT p.*, COUNT(w.id) AS work_item_count,
       (SELECT fr.verdict
        FROM feasibility_result fr
        WHERE fr.snapshot_id = (SELECT id FROM planning_snapshot ORDER BY created_at DESC LIMIT 1)
          AND fr.project_id = p.id) AS feasibility_verdict
     FROM project p
     LEFT JOIN work_item w ON w.project_id = p.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY p.updated_at DESC, p.id ASC
     LIMIT ?`,
    ...params,
    pageLimit + 1,
  );

  const hasMore = projectRows.length > pageLimit;
  const items = projectRows.slice(0, pageLimit).map((row) => {
    const { work_item_count, feasibility_verdict, ...project } = row;
    return { ...project, work_item_count, feasibility_verdict };
  });
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].updated_at, items[items.length - 1].id)
      : null;

  return c.json({ items, nextCursor });
});

projectsRouter.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const project = await first<Project>(db, "SELECT * FROM project WHERE id = ?", id);
  if (!project) return badRequest("Project not found");

  const phases = await all<ProjectPhase>(
    db,
    "SELECT * FROM phase WHERE project_id = ? ORDER BY sequence",
    id,
  );

  const counts = await first<{ work_items: number; allocations: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM work_item WHERE project_id = ?) AS work_items,
       (SELECT COUNT(*) FROM allocation WHERE project_id = ?) AS allocations`,
    id,
    id,
  );

  return c.json({
    project,
    phases,
    counts: counts ?? { work_items: 0, allocations: 0 },
  });
});

projectsRouter.get("/:id/feasibility", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const project = await first<{ id: string }>(
    db,
    "SELECT id FROM project WHERE id = ?",
    id,
  );
  if (!project) return badRequest("Project not found");

  const { snapshot } = await ensureCurrentSnapshot(db);

  const row = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM feasibility_result WHERE snapshot_id = ? AND project_id = ?",
    snapshot.id,
    id,
  );

  return c.json({
    feasibility: row ? mapFeasibilityResultRow(row) : null,
  });
});

projectsRouter.post("/:id/alternatives", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const projectRow = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM project WHERE id = ?",
    id,
  );
  if (!projectRow) return badRequest("Project not found");

  const { snapshot } = await ensureCurrentSnapshot(db);

  const [
    phaseRows,
    allocationRows,
    personRows,
    dependencyRows,
    calendarRow,
    workItemRows,
    ledgerRows,
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM phase WHERE project_id = ? ORDER BY sequence",
      id,
    ),
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(db, "SELECT * FROM person"),
    all<Record<string, unknown>>(db, "SELECT * FROM dependency"),
    first<Record<string, unknown>>(db, "SELECT * FROM org_calendar LIMIT 1"),
    all<Record<string, unknown>>(db, "SELECT * FROM work_item WHERE project_id = ?", id),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM capacity_entry WHERE snapshot_id = ?",
      snapshot.id,
    ),
  ]);

  const project = mapProjectRowToEngine(projectRow);
  const phases = phaseRows.map(mapPhaseRowToEngine);
  const allocations = allocationRows.map(mapAllocationRowToEngine);
  const people = personRows.map(mapPersonRowToEngine);
  const dependencies = dependencyRows.map(mapDependencyRowToEngine);
  const calendar = parseOrgCalendarRow(calendarRow);
  const workItems = workItemRows.map(mapWorkItemRowToEngine);
  const ledger = ledgerRows.map(mapCapacityEntryRow);

  const feasibilityInput: FeasibilityInput = buildFeasibilityInput({
    project,
    phases,
    allocations,
    people,
    dependencies,
    calendar,
  });

  const feasibilityResult: FeasibilityResult = computeFeasibility(
    feasibilityInput,
  );

  const personFreeHours = personFreeHoursFromLedger(ledger);
  const alternatives: Alternative[] = generateAlternatives({
    feasibility: feasibilityInput,
    result: feasibilityResult,
    workItems,
    personFreeHours,
  });

  return c.json({ alternatives });
});

projectsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await parseBody(c, PatchBodySchema);

  const project = await first<{ id: string }>(
    db,
    "SELECT id FROM project WHERE id = ?",
    id,
  );
  if (!project) return badRequest("Project not found");

  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.priority !== undefined) {
    fields.push("priority = ?");
    params.push(body.priority);
  }
  if (body.deadline !== undefined) {
    fields.push("deadline = ?");
    params.push(body.deadline);
  }
  if (body.declared_start !== undefined) {
    fields.push("declared_start = ?");
    params.push(body.declared_start);
  }
  if (body.declared_end !== undefined) {
    fields.push("declared_end = ?");
    params.push(body.declared_end);
  }
  if (body.status !== undefined) {
    fields.push("status = ?");
    params.push(body.status);
  }

  if (fields.length === 0) {
    return badRequest("No fields provided");
  }

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  await run(
    db,
    `UPDATE project SET ${fields.join(", ")} WHERE id = ?`,
    ...params,
  );

  return c.json({ id });
});
