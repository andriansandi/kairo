import { Hono } from "hono";
import type { PlanningSnapshot } from "@kairo/types";
import { first } from "../db";
import { ensureCurrentSnapshot } from "../services/snapshot";

export const snapshotsRouter = new Hono();

snapshotsRouter.get("/current", async (c) => {
  const db = c.get("db") as D1Database;
  const snapshot = await first<PlanningSnapshot>(
    db,
    "SELECT * FROM planning_snapshot ORDER BY created_at DESC LIMIT 1",
  );
  return c.json({ snapshot });
});

snapshotsRouter.post("/rebuild", async (c) => {
  const db = c.get("db") as D1Database;
  const { snapshot, rebuilt, counts } = await ensureCurrentSnapshot(db);
  return c.json({ snapshot, rebuilt, counts });
});
