import { describe, it, expect, vi } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";
import { authCookie, isUsersQuery, TEST_USER_ROW } from "./helpers/auth";

const EMPTY_HASH = "ae53892917be70ed1a8b85d13da83a0126e3d6add85737ee09a51af8becbdc1f";

function makeDb(seed: {
  projects?: Record<string, unknown>[];
  people?: Record<string, unknown>[];
  conflicts?: Record<string, unknown>[];
  feasibility?: Record<string, unknown>[];
  capacity?: Record<string, unknown>[];
  teams?: Record<string, unknown>[];
  memberships?: Record<string, unknown>[];
  skills?: Record<string, unknown>[];
  personSkills?: Record<string, unknown>[];
  appSettings?: Record<string, string>;
} = {}) {
  const settings = seed.appSettings ?? {};
  const snapshot = {
    id: "snap-1",
    created_at: "2026-09-05T10:00:00.000Z",
    inputs_hash: EMPTY_HASH,
    trigger: "unknown",
    notes: "",
  };

  const rowsByTable: Record<string, unknown[]> = {
    project: seed.projects ?? [],
    work_item: [],
    phase: [],
    dependency: [],
    person: seed.people ?? [],
    team: seed.teams ?? [],
    team_membership: seed.memberships ?? [],
    role: [],
    skill: seed.skills ?? [],
    person_skill: seed.personSkills ?? [],
    allocation: [],
    pto_entry: [],
    org_calendar: [],
    jr_skill_requirement: [],
    timeline_import: [],
    scenario_def: [],
    planning_snapshot: [snapshot],
    conflict: seed.conflicts ?? [],
    feasibility_result: seed.feasibility ?? [],
    capacity_entry: seed.capacity ?? [],
    app_setting: Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: "2026-09-05T10:00:00.000Z",
    })),
  };

  const analyses: Record<string, unknown>[] = [];

  function matchSql(sql: string) {
    const lower = sql.toLowerCase().replace(/\s+/g, " ").trim();
    if (lower === "select * from planning_snapshot order by created_at desc limit 1") return { type: "latestSnapshot" };
    if (lower === "select * from planning_snapshot order by created_at desc limit 1 offset 1") return { type: "prevSnapshot" };
    if (lower.startsWith("select * from planning_snapshot where inputs_hash")) return { type: "snapshotByHash" };
    if (lower.startsWith("select * from planning_snapshot where id")) return { type: "snapshotById" };
    if (lower.startsWith("select value from app_setting where key")) return { type: "settingByKey" };
    if (lower.startsWith("select * from org_calendar limit 1")) return { type: "calendar" };
    if (lower.startsWith("select * from analysis where id")) return { type: "analysisById" };
    const selectAll = lower.match(/^select \* from ([a-z_]+)\b/);
    if (selectAll) return { type: "selectAll", table: selectAll[1] };
    const countM = lower.match(/^select count\(\*\) as ([a-z_]+) from ([a-z_]+)\b/);
    if (countM) return { type: "count", countCol: countM[1], table: countM[2] };
    if (lower.startsWith("pragma table_info")) return { type: "pragma", table: lower.match(/\(([^)]+)\)/)?.[1] };
    return null;
  }

  const makePrepared = (sql: string, params: unknown[]) => ({
    all: vi.fn(async () => {
      const info = matchSql(sql);
      if (info?.type === "selectAll") {
        if (info.table === "analysis") return { results: analyses };
        return { results: rowsByTable[info.table!] ?? [] };
      }
      if (info?.type === "count") return { results: [{ [info.countCol!]: (rowsByTable[info.table!] ?? []).length }] };
      if (info?.type === "pragma") return { results: [{ name: "updated_at" }] };
      return { results: [] };
    }),
    first: vi.fn(async () => {
      const info = matchSql(sql);
      if (info?.type === "latestSnapshot") return snapshot;
      if (info?.type === "snapshotByHash") return snapshot;
      if (info?.type === "snapshotById") return snapshot;
      if (info?.type === "calendar") return undefined;
      if (info?.type === "settingByKey") {
        const key = params[0] as string;
        const value = settings[key];
        return value ? { key, value, updated_at: "2026-09-05T10:00:00.000Z" } : undefined;
      }
      if (info?.type === "analysisById") {
        return analyses.find((a) => a.id === params[0]) ?? undefined;
      }
      if (isUsersQuery(sql)) return TEST_USER_ROW;
      return undefined;
    }),
    run: vi.fn(async () => {
      const lower = sql.toLowerCase();
      if (lower.includes("insert into analysis")) {
        analyses.push({
          id: params[0],
          snapshot_id: params[1],
          kind: params[2],
          subject_type: params[3],
          subject_id: params[4],
          prompt_digest: params[5],
          provider: params[6],
          model: params[7],
          output: params[8],
          validation_result: params[9],
          cited_fact_ids: params[10],
          superseded: params[11],
          created_at: params[12],
        });
      }
      return { success: true };
    }),
  });

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    batch: vi.fn(async () => []),
    _analyses: analyses,
  } as unknown as D1Database & { _analyses: Record<string, unknown>[] };
}

function buildEnv(db: D1Database): Env {
  return {
    DB: db,
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "0.0.0-test",
    AUTH_SECRET: "test-secret",
  };
}

async function createAnalysis(db: D1Database, body: Record<string, unknown>) {
  const app = createApp(buildEnv(db));
  return app.fetch(
    new Request("http://example.com/api/v1/analyses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authCookie()),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/analyses", () => {
  it("falls back to deterministic when AI not configured", async () => {
    const db = makeDb({
      projects: [
        {
          id: "p1",
          name: "Apollo",
          deadline: "2026-11-30",
          declared_start: "2026-10-01",
          declared_end: "2026-10-31",
        },
      ],
      conflicts: [
        {
          id: "c1",
          snapshot_id: "snap-1",
          rule: "C1",
          severity: "critical",
          person_id: "pe1",
          project_id: "p1",
          team_id: null,
          phase_id: null,
          window_start: "2026-W41",
          window_end: "2026-W42",
          explanation: "Over-allocated on Apollo",
          metrics: JSON.stringify({ max_utilization: 1.25 }),
        },
      ],
    });
    const res = await createAnalysis(db, {
      kind: "explain",
      subject_type: "project",
      subject_id: "p1",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysis: Record<string, unknown> };
    const output = body.analysis.output as Record<string, unknown>;
    expect(output.mode).toBe("deterministic");
    expect(body.analysis.provider).toBe("none");
    expect(body.analysis.cited_fact_ids).toBeInstanceOf(Array);
  });

  it("lists analyses", async () => {
    const db = makeDb();
    db._analyses.push({
      id: "a1",
      snapshot_id: "snap-1",
      kind: "explain",
      subject_type: "project",
      subject_id: "p1",
      prompt_digest: "",
      provider: "none",
      model: "",
      output: "{}",
      validation_result: JSON.stringify({ valid: true, errors: [] }),
      cited_fact_ids: JSON.stringify(["C:1"]),
      superseded: 0,
      created_at: "2026-09-05T10:00:00.000Z",
    });

    const app = createApp(buildEnv(db));
    const res = await app.fetch(
      new Request(
        "http://example.com/api/v1/analyses?subject_type=project&subject_id=p1",
        { headers: await authCookie() },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("gets analysis by id", async () => {
    const db = makeDb();
    db._analyses.push({
      id: "a2",
      snapshot_id: "snap-1",
      kind: "explain",
      subject_type: "project",
      subject_id: "p1",
      prompt_digest: "",
      provider: "none",
      model: "",
      output: "{}",
      validation_result: JSON.stringify({ valid: true, errors: [] }),
      cited_fact_ids: JSON.stringify(["C:1"]),
      superseded: 0,
      created_at: "2026-09-05T10:00:00.000Z",
    });

    const app = createApp(buildEnv(db));
    const res = await app.fetch(
      new Request("http://example.com/api/v1/analyses/a2", {
        headers: await authCookie(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysis: Record<string, unknown> };
    expect(body.analysis.id).toBe("a2");
  });
});
