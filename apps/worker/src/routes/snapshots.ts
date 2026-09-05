import { Hono } from "hono";
import type { PlanningSnapshot } from "@kairo/types";
import { first, newId, nowIso, run } from "../db";
import { computeInputsFingerprint } from "../services/snapshot";

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
  const { fingerprint, counts } = await computeInputsFingerprint(db);

  const latest = await first<PlanningSnapshot>(
    db,
    "SELECT * FROM planning_snapshot ORDER BY created_at DESC LIMIT 1",
  );

  if (latest && latest.inputs_hash === fingerprint) {
    return c.json({ snapshot: latest, rebuilt: false });
  }

  await run(
    db,
    "INSERT INTO planning_snapshot (id, created_at, inputs_hash) VALUES (?, ?, ?)",
    newId(),
    nowIso(),
    fingerprint,
  );

  const snapshot = await first<PlanningSnapshot>(
    db,
    "SELECT * FROM planning_snapshot WHERE inputs_hash = ?",
    fingerprint,
  );

  return c.json({ snapshot, rebuilt: true, counts });
});
