import { Hono } from "hono";
import { z } from "zod";
import type { ScenarioDiffResult } from "@kairo/scenario";
import { ScenarioOpSchema } from "@kairo/types";
import { all, first, fromJson, newId, nowIso, run } from "../db";
import { badRequest, notFound, parseBody } from "../http";
import { mapScenarioDefRow, recomputeScenario } from "../services/scenario-service";
import { ensureCurrentSnapshot } from "../services/snapshot";

const CreateScenarioSchema = z.object({
  name: z.string().min(1).max(200),
  ops: z.array(ScenarioOpSchema),
});

function userFromContext(c: any): string {
  const email = c.req.header("CF-Access-Authenticated-User-Email");
  return email ?? "system";
}

export const scenariosRouter = new Hono();

scenariosRouter.post("/", async (c) => {
  const db = c.get("db") as D1Database;
  const body = await parseBody(c, CreateScenarioSchema);

  const { snapshot } = await ensureCurrentSnapshot(db);
  const id = newId();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO scenario_def
      (id, name, base_snapshot_id, ops, created_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.name,
    snapshot.id,
    JSON.stringify(body.ops),
    userFromContext(c),
    "draft",
    now,
    now,
  );

  const scenario = mapScenarioDefRow(
    (await first<Record<string, unknown>>(
      db,
      "SELECT * FROM scenario_def WHERE id = ?",
      id,
    ))!,
  );

  return c.json({ scenario }, 201);
});

scenariosRouter.get("/", async (c) => {
  const db = c.get("db") as D1Database;
  const rows = await all<Record<string, unknown>>(
    db,
    "SELECT * FROM scenario_def ORDER BY created_at DESC",
  );
  return c.json({ items: rows.map(mapScenarioDefRow) });
});

function toStoredDiff(row: Record<string, unknown>): ScenarioDiffResult {
  const capacity = fromJson<ScenarioDiffResult["capacity_deltas"]>(
    row.capacity_deltas,
    [],
  );
  const conflictChanges = fromJson<ScenarioDiffResult["conflict_changes"]>(
    row.conflict_changes,
    { added: [], removed: [] },
  );
  const feasibility = fromJson<ScenarioDiffResult["feasibility_deltas"]>(
    row.feasibility_deltas,
    [],
  );

  return {
    summary: {
      utilization_changed_person_weeks: capacity.length,
      conflicts_added: conflictChanges.added.length,
      conflicts_removed: conflictChanges.removed.length,
      feasibility_changed_projects: feasibility.length,
    },
    capacity_deltas: capacity,
    conflict_changes: conflictChanges,
    feasibility_deltas: feasibility,
  };
}

scenariosRouter.get("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const scenarioRow = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM scenario_def WHERE id = ?",
    id,
  );
  if (!scenarioRow) notFound("Scenario not found");

  const diffRow = await first<Record<string, unknown>>(
    db,
    "SELECT * FROM scenario_diff WHERE scenario_id = ?",
    id,
  );

  return c.json({
    scenario: mapScenarioDefRow(scenarioRow!),
    diff: diffRow ? toStoredDiff(diffRow) : null,
  });
});

scenariosRouter.post("/:id/recompute", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  try {
    const { scenario, diff } = await recomputeScenario(db, id);
    return c.json({ scenario, diff, summary: diff.summary });
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    if (err.message.startsWith("scenario") && err.message.includes("not found")) {
      notFound("Scenario not found");
    }
    if (err.message.includes("not found")) {
      badRequest(err.message);
    }
    throw err;
  }
});

scenariosRouter.delete("/:id", async (c) => {
  const db = c.get("db") as D1Database;
  const id = c.req.param("id");

  const existing = await first<{ id: string }>(
    db,
    "SELECT id FROM scenario_def WHERE id = ?",
    id,
  );
  if (!existing) notFound("Scenario not found");

  await run(db, "DELETE FROM scenario_def WHERE id = ?", id);
  return c.body(null, 204);
});
