import { Hono } from "hono";
import { z } from "zod";
import { parseQuery, parseBody, badRequest, notFound } from "../http";
import { all, first, newId, nowIso, run } from "../db";
import { matchWorkItem, type MatchResultEntry } from "@kairo/matching-engine";
import {
  ensureCurrentSnapshot,
  mapPersonRowToEngine,
  mapAllocationRowToEngine,
  mapPersonSkillRowToEngine,
  mapCapacityEntryRow,
  mapJrSkillRequirementRowToEngine,
} from "../services/snapshot";
import type { WorkItem, Person, PersonSkill, Allocation } from "@kairo/types";

const WorkItemStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);

const ListQuerySchema = z.object({
  project_id: z.string().optional(),
  status: WorkItemStatusSchema.optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
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

const SkillRequirementsBodySchema = z.object({
  requirements: z.array(
    z.object({
      skill_id: z.string().min(1),
      min_level: z.coerce.number().int().min(1).max(4),
      weight: z.enum(["must", "nice"]),
    }),
  ),
});

export const workItemsRouter = new Hono();

workItemsRouter.get("/", async (c) => {
  const db = c.get("db");
  const { project_id, status, q, limit, cursor } = parseQuery(c, ListQuerySchema);
  const decoded = decodeCursor(cursor);

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  if (project_id) {
    conditions.push("w.project_id = ?");
    params.push(project_id);
  }
  if (status) {
    conditions.push("w.status = ?");
    params.push(status);
  }
  if (q) {
    conditions.push("w.title LIKE ?");
    params.push(`%${q}%`);
  }
  if (decoded) {
    conditions.push("(w.updated_at < ? OR (w.updated_at = ? AND w.id > ?))");
    params.push(decoded.updatedAt, decoded.updatedAt, decoded.id);
  }

  const pageLimit = limit ?? 50;
  const where = conditions.join(" AND ");
  const rows = await all<
    WorkItem & { project_name: string }
  >(
    db,
    `SELECT w.*, p.name AS project_name
     FROM work_item w
     JOIN project p ON p.id = w.project_id
     WHERE ${where}
     ORDER BY w.updated_at DESC, w.id ASC
     LIMIT ?`,
    ...params,
    pageLimit + 1,
  );

  const hasMore = rows.length > pageLimit;
  const items = rows.slice(0, pageLimit);
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].updated_at, items[items.length - 1].id)
      : null;

  return c.json({ items, nextCursor });
});

workItemsRouter.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const item = await first<WorkItem & { project_name: string }>(
    db,
    `SELECT w.*, p.name AS project_name
     FROM work_item w
     JOIN project p ON p.id = w.project_id
     WHERE w.id = ?`,
    id,
  );
  if (!item) return badRequest("Work item not found");

  return c.json({ work_item: item });
});

workItemsRouter.put("/:id/skill-requirements", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const { requirements } = await parseBody(c, SkillRequirementsBodySchema);

  const workItem = await first<{ id: string; project_id: string }>(
    db,
    "SELECT id, project_id FROM work_item WHERE id = ?",
    id,
  );
  if (!workItem) return notFound("Work item not found");

  if (requirements.length > 0) {
    const skillIds = [...new Set(requirements.map((r) => r.skill_id))];
    const placeholders = skillIds.map(() => "?").join(", ");
    const found = await all<{ id: string }>(
      db,
      `SELECT id FROM skill WHERE id IN (${placeholders})`,
      ...skillIds,
    );
    const foundSet = new Set(found.map((r) => r.id));
    const missing = skillIds.find((sid) => !foundSet.has(sid));
    if (missing) return badRequest(`Skill not found: ${missing}`);
  }

  const statements: D1PreparedStatement[] = [];
  statements.push(
    db.prepare("DELETE FROM jr_skill_requirement WHERE work_item_id = ?").bind(id),
  );

  const now = nowIso();
  for (const req of requirements) {
    statements.push(
      db
        .prepare(
          `INSERT INTO jr_skill_requirement
            (id, work_item_id, skill_id, min_level, weight, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          id,
          req.skill_id,
          req.min_level,
          req.weight,
          "manual",
          now,
          now,
        ),
    );
  }

  await db.batch(statements);
  return c.json({ work_item_id: id, requirements });
});

workItemsRouter.get("/:id/matches", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const workItem = await first<WorkItem & { project_name: string }>(
    db,
    `SELECT w.*, p.name AS project_name
     FROM work_item w
     JOIN project p ON p.id = w.project_id
     WHERE w.id = ?`,
    id,
  );
  if (!workItem) return notFound("Work item not found");

  const { snapshot } = await ensureCurrentSnapshot(db);

  const [
    requirementRows,
    personRows,
    personSkillRows,
    allocationRows,
    ledgerRows,
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM jr_skill_requirement WHERE work_item_id = ?",
      id,
    ),
    all<Record<string, unknown>>(db, "SELECT * FROM person"),
    all<Record<string, unknown>>(db, "SELECT * FROM person_skill"),
    all<Record<string, unknown>>(db, "SELECT * FROM allocation"),
    all<Record<string, unknown>>(
      db,
      "SELECT * FROM capacity_entry WHERE snapshot_id = ?",
      snapshot.id,
    ),
  ]);

  const requirements = requirementRows.map(mapJrSkillRequirementRowToEngine);
  const people = personRows.map(mapPersonRowToEngine);
  const personSkills = personSkillRows.map(mapPersonSkillRowToEngine);
  const allocations = allocationRows.map(mapAllocationRowToEngine);
  const ledger = ledgerRows.map(mapCapacityEntryRow);

  const namesById = new Map(people.map((p) => [p.id, p.name] as const));

  const results = matchWorkItem({
    workItem: {
      id: workItem.id,
      title: workItem.title,
      estimate_hours: workItem.estimate_normalized_hours ?? undefined,
      start_date: workItem.start_date ?? undefined,
      due_date: workItem.due_date ?? undefined,
      project_id: workItem.project_id,
    },
    requirements: requirements.map((r) => ({
      skill_id: r.skill_id,
      min_level: r.min_level,
      weight: r.weight,
    })),
    people,
    personSkills,
    allocations,
    ledger,
  });

  const augmented = results.map((r) => ({
    ...r,
    person_name: namesById.get(r.person_id) ?? null,
  }));

  return c.json({
    results: augmented,
    requirements,
  });
});
