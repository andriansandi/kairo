import { describe, it, expect } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";

function buildDb(): D1Database & {
  _enqueueFirst: (rows: unknown[]) => void;
  _enqueueAll: (rows: unknown[]) => void;
} {
  const firstQueue: Array<{ rows: unknown[] }> = [];
  const allQueue: Array<{ rows: unknown[] }> = [];

  return {
    prepare: () => ({
      bind: function (...params: unknown[]) {
        void params;
        return {
          first: async <T>() => {
            const next = firstQueue.shift();
            return next ? (next.rows[0] as T | undefined) : undefined;
          },
          all: async <T>() => {
            const next = allQueue.shift();
            return { results: next ? (next.rows as T[]) : [] };
          },
          run: async () => ({ success: true, results: [], meta: {} }),
        };
      },
    }),
    _enqueueFirst(rows: unknown[]) {
      firstQueue.push({ rows });
    },
    _enqueueAll(rows: unknown[]) {
      allQueue.push({ rows });
    },
  } as unknown as D1Database & {
    _enqueueFirst: (rows: unknown[]) => void;
    _enqueueAll: (rows: unknown[]) => void;
  };
}

function buildEnv(envOverrides: Partial<Env> = {}): Env {
  return {
    DB: buildDb(),
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "0.0.0-test",
    ...envOverrides,
  };
}

describe("Plane routes", () => {
  it("returns 400 when Plane is not configured", async () => {
    const app = createApp(buildEnv());
    const res = await app.fetch(
      new Request("http://example.com/api/v1/plane/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "full" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  it("lists sync runs with parsed stats/errors", async () => {
    const db = buildDb();
    db._enqueueAll([
      {
        id: "run1",
        source: "plane",
        type: "full",
        cursor: null,
        status: "success",
        stats: '{"projects":2}',
        errors: '[]',
        started_at: "2026-01-01T00:00:00.000Z",
        finished_at: "2026-01-01T01:00:00.000Z",
      },
    ]);

    const app = createApp(buildEnv({ DB: db }));
    const res = await app.fetch(
      new Request("http://example.com/api/v1/plane/sync-runs"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sync_runs: Array<{ stats: Record<string, unknown> }>;
    };
    expect(body.sync_runs[0].stats.projects).toBe(2);
  });

  it("lists the mapping queue", async () => {
    const db = buildDb();
    db._enqueueAll([
      { id: "m1", name: "Unmatched", email: "u@example.com", person_id: null },
    ]);

    const app = createApp(buildEnv({ DB: db }));
    const res = await app.fetch(
      new Request("http://example.com/api/v1/plane/mapping-queue"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("m1");
  });
});
