import { Hono } from "hono";
import { z } from "zod";
import { parseBody, badRequest } from "../http";
import { runPlaneSync, type PlaneSyncEnv } from "../services/plane-sync";
import { all, first, newId, nowIso, run } from "../db";
import type { SyncRun } from "@kairo/types";

function planeEnv(c: {
  get: <T>(key: "env") => T;
}): PlaneSyncEnv {
  return c.get("env") as PlaneSyncEnv;
}

const SyncBodySchema = z.object({
  type: z.enum(["full", "incremental"]).optional().default("full"),
});

const ResolveMappingSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("link"),
    person_id: z.string(),
  }),
  z.object({
    action: z.literal("create"),
  }),
]);

function parseSyncRun(row: SyncRun): SyncRun {
  return {
    ...row,
    stats:
      typeof row.stats === "string"
        ? (JSON.parse(row.stats) as Record<string, unknown>)
        : row.stats,
    errors:
      typeof row.errors === "string"
        ? (JSON.parse(row.errors) as unknown[])
        : row.errors,
  };
}

export const planeRouter = new Hono();

planeRouter.post("/sync", async (c) => {
  const env = planeEnv(c);
  const { type } = await parseBody(c, SyncBodySchema);

  if (!env.PLANE_API_KEY) {
    return badRequest("Plane API is not configured");
  }

  const syncRun = await runPlaneSync(env, type ?? "full");
  return c.json({ sync_run: parseSyncRun(syncRun) });
});

planeRouter.get("/sync-runs", async (c) => {
  const db = c.get("db");
  const rows = await all<SyncRun>(
    db,
    "SELECT * FROM sync_run WHERE source = 'plane' ORDER BY started_at DESC LIMIT 20",
  );
  return c.json({ sync_runs: rows.map(parseSyncRun) });
});

planeRouter.get("/mapping-queue", async (c) => {
  const db = c.get("db");
  const rows = await all<{
    id: string;
    name: string;
    email: string | null;
    person_id: string | null;
  }>(
    db,
    "SELECT id, name, email, person_id FROM plane_member WHERE person_id IS NULL ORDER BY name",
  );
  return c.json({ items: rows });
});

planeRouter.post("/mapping-queue/:memberId/resolve", async (c) => {
  const db = c.get("db");
  const memberId = c.req.param("memberId");
  const body = await parseBody(c, ResolveMappingSchema);

  const member = await first<{ id: string; name: string; email: string | null }>(
    db,
    "SELECT id, name, email FROM plane_member WHERE id = ?",
    memberId,
  );
  if (!member) return badRequest("Member not found");

  let personId: string;
  const isoNow = nowIso();

  if (body.action === "link") {
    personId = body.person_id;
    const person = await first<{ id: string }>(
      db,
      "SELECT id FROM person WHERE id = ?",
      personId,
    );
    if (!person) return badRequest("Person not found");
  } else {
    // create: ensure default "Member" role exists, create person, then link.
    let role = await first<{ id: string }>(
      db,
      "SELECT id FROM role WHERE name = ?",
      "Member",
    );
    if (!role) {
      const roleId = newId();
      await run(
        db,
        "INSERT INTO role (id, name, seniority_ladder, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        roleId,
        "Member",
        JSON.stringify([]),
        isoNow,
        isoNow,
      );
      role = { id: roleId };
    }

    personId = newId();
    await run(
      db,
      `INSERT INTO person
         (id, name, email, role_id, seniority, hours_per_day, overhead_pct, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      personId,
      member.name,
      member.email ?? null,
      role.id,
      2,
      8,
      0.2,
      1,
      isoNow,
      isoNow,
    );
  }

  await run(
    db,
    "UPDATE plane_member SET person_id = ?, updated_at = ? WHERE id = ?",
    personId,
    isoNow,
    memberId,
  );

  return c.json({ member_id: memberId, person_id: personId });
});
