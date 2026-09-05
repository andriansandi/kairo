import { describe, it, expect, vi } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";

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

  const projects = seed.projects ?? [];
  const people = seed.people ?? [];
  const conflicts = seed.conflicts ?? [];
  const feasibility = seed.feasibility ?? [];
  const capacity = seed.capacity ?? [];
  const teams = seed.teams ?? [];
  const memberships = seed.memberships ?? [];
  const skills = seed.skills ?? [];
  const personSkills = seed.personSkills ?? [];

  const rowsByTable: Record<string, unknown[]> = {
    project: projects,
    work_item: [],
    phase: [],
    dependency: [],
    person: people,
    team: teams,
    team_membership: memberships,
    role: [],
    skill: skills,
    person_skill: personSkills,
    allocation: [],
    pto_entry: [],
    org_calendar: [],
    jr_skill_requirement: [],
    timeline_import: [],
    scenario_def: [],
    planning_snapshot: [snapshot],
    conflict: conflicts,
    feasibility_result: feasibility,
    capacity_entry: capacity,
    app_setting: Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: "2026-09-05T10:00:00.000Z",
    })),
  };

  function matchSql(sql: string) {
    const lower = sql.toLowerCase().replace(/\s+/g, " ").trim();
    if (lower === "select * from planning_snapshot order by created_at desc limit 1") return { type: "latestSnapshot" };
    if (lower === "select * from planning_snapshot order by created_at desc limit 1 offset 1") return { type: "prevSnapshot" };
    if (lower.startsWith("select * from planning_snapshot where inputs_hash")) return { type: "snapshotByHash" };
    if (lower.startsWith("select * from planning_snapshot where id")) return { type: "snapshotById" };
    if (lower.startsWith("select value from app_setting where key")) return { type: "settingByKey" };
    if (lower.startsWith("select * from org_calendar limit 1")) return { type: "calendar" };
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
      if (info?.type === "selectAll") return { results: rowsByTable[info.table!] ?? [] };
      if (info?.type === "count") {
        return { results: [{ [info.countCol!]: (rowsByTable[info.table!] ?? []).length }] };
      }
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
      return undefined;
    }),
    run: vi.fn(async () => ({ success: true })),
  });

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
}

function buildEnv(db: D1Database): Env {
  return {
    DB: db,
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "0.0.0-test",
  };
}

async function ask(db: D1Database, question: string) {
  const app = createApp(buildEnv(db));
  return app.fetch(
    new Request("http://example.com/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );
}

describe("POST /api/v1/ask", () => {
  it("routes overloaded intent to deterministic answer", async () => {
    const db = makeDb({
      people: [{ id: "pe1", name: "Alice" }],
      conflicts: [
        {
          id: "c1",
          snapshot_id: "snap-1",
          rule: "C1",
          severity: "critical",
          person_id: "pe1",
          project_id: null,
          team_id: null,
          phase_id: null,
          window_start: "2026-W41",
          window_end: "2026-W41",
          explanation: "Alice is over-allocated at 1.25 FTE",
          metrics: JSON.stringify({ max_utilization: 1.25 }),
        },
      ],
    });
    const res = await ask(db, "Who is overloaded?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("deterministic");
    expect((body.answer as string).toLowerCase()).toContain("alice");
    expect(body.sources).toContain("C:1");
  });

  it("routes at-risk intent when no risks present", async () => {
    const db = makeDb({
      projects: [{ id: "p1", name: "Apollo" }],
      feasibility: [
        {
          id: "f1",
          snapshot_id: "snap-1",
          project_id: "p1",
          computed_start: "2026-10-01",
          computed_finish: "2026-11-15",
          slack_days: 5,
          buffer_days: 10,
          verdict: "healthy",
          drivers: JSON.stringify([]),
          critical_path: JSON.stringify([]),
          per_phase_load: JSON.stringify({}),
        },
      ],
    });
    const res = await ask(db, "Which projects are at risk?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("deterministic");
    expect((body.answer as string).toLowerCase()).toContain("no projects");
  });

  it("routes devops intent", async () => {
    const db = makeDb({
      teams: [{ id: "t-devops", name: "DevOps", type: "devops" }],
      memberships: [{ person_id: "pe1", team_id: "t-devops" }],
      capacity: [
        {
          snapshot_id: "snap-1",
          week_key: "2026-W41",
          person_id: "pe1",
          available_h: 40,
          planned_h: 44,
          utilization: 1.1,
        },
      ],
    });
    const res = await ask(db, "What is DevOps utilization?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("deterministic");
    expect((body.answer as string).toLowerCase()).toContain("utilization");
  });

  it("routes skill spof intent", async () => {
    const db = makeDb({
      skills: [{ id: "s1", name: "Terraform", category: "infra" }],
      people: [{ id: "pe1", name: "Alice" }],
      personSkills: [{ person_id: "pe1", skill_id: "s1", level: 3 }],
      capacity: [
        {
          snapshot_id: "snap-1",
          week_key: "2026-W41",
          person_id: "pe1",
          available_h: 40,
          planned_h: 20,
          utilization: 0.5,
        },
      ],
    });
    const res = await ask(db, "Any skill gaps?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("deterministic");
    expect((body.answer as string).toLowerCase()).toContain("terraform");
  });

  it("routes capacity intent", async () => {
    const db = makeDb({
      teams: [{ id: "t1", name: "Builder A", type: "builder" }],
      memberships: [{ person_id: "pe1", team_id: "t1" }],
      capacity: [
        {
          snapshot_id: "snap-1",
          week_key: "2026-W41",
          person_id: "pe1",
          available_h: 40,
          planned_h: 40,
          utilization: 1.0,
        },
      ],
    });
    const res = await ask(db, "team capacity");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("deterministic");
    expect((body.answer as string).toLowerCase()).toContain("t1");
  });

  it("falls through to unavailable when AI not configured", async () => {
    const db = makeDb();
    const res = await ask(db, "Who knows React?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("unavailable");
    expect(body.answer).toContain("No AI model is configured");
  });
});
