import { Hono } from "hono";
import { z } from "zod";
import { parseQuery, badRequest } from "../http";
import { all, first } from "../db";
import type { WorkItem } from "@kairo/types";

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
