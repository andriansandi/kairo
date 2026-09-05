import { describe, it, expect, vi } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";

function makeR2(): R2Bucket {
  return {
    put: vi.fn(async () => ({ key: "mock-key" })),
    delete: vi.fn(async () => undefined),
  } as unknown as R2Bucket;
}

interface CapturedStmt {
  sql: string;
  params: unknown[];
}

function makeDb() {
  const statements: CapturedStmt[] = [];
  const batches: CapturedStmt[][] = [];

  const makePrepared = (sql: string, params: unknown[]) => {
    const stmt = {
      sql,
      params,
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => undefined),
      run: vi.fn(async () => ({ success: true })),
    };
    statements.push(stmt);
    return stmt;
  };

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    batch: vi.fn(async (stmts: unknown[]) => {
      batches.push(stmts as CapturedStmt[]);
      return Array.isArray(stmts) ? stmts.map(() => ({ success: true })) : [];
    }),
  } as unknown as D1Database & {
    getStatements: () => CapturedStmt[];
    getBatches: () => CapturedStmt[][];
  };

  db.getStatements = () => statements;
  db.getBatches = () => batches;

  return db;
}

function buildEnv(db: D1Database, r2?: R2Bucket): Env {
  return {
    DB: db,
    IMPORTS: r2 ?? (makeR2() as unknown as R2Bucket),
    ENV: "dev",
    VERSION: "0.0.0-test",
  };
}

async function confirmImport(
  db: D1Database,
  importId: string,
  body: Record<string, unknown>,
) {
  const env = buildEnv(db);
  const app = createApp(env);
  return app.fetch(
    new Request(`http://example.com/api/v1/imports/${importId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/imports/:id/confirm", () => {
  it("creates project, phase and allocation for valid rows", async () => {
    const db = makeDb();

    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => {
        const stmt: Record<string, unknown> = {
          sql,
          params,
          all: vi.fn(async () => {
            if (sql.toLowerCase().includes("timeline_import_row")) {
              return {
                results: [
                  {
                    row_number: 1,
                    raw: JSON.stringify({
                      project_name: "Apollo",
                      phase_name: "Design",
                      start_date: "2026-10-01",
                      end_date: "2026-10-31",
                      effort_hours: 80,
                      person_email: "alice@example.com",
                      person_name: "Alice",
                      fte: 0.5,
                    }),
                  },
                ],
              };
            }
            return { results: [] };
          }),
          first: vi.fn(async () => {
            if (sql.toLowerCase().includes("timeline_import")) {
              return { id: params[0], status: "draft" };
            }
            return undefined;
          }),
          run: vi.fn(async () => ({ success: true })),
        };
        return stmt;
      }),
    }));

    const res = await confirmImport(db, "imp-1", {
      project_mappings: [
        { key: "Apollo", action: "create", code: "apollo", name: "Apollo" },
      ],
      person_mappings: [
        { key: "alice@example.com", action: "link", person_id: "person-1" },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.projects_created).toBe(1);
    expect(body.phases_created).toBe(1);
    expect(body.allocations_created).toBe(1);
    expect(body.rows_skipped).toBe(0);

    const batches = db.getBatches();
    expect(batches.length).toBeGreaterThanOrEqual(2);

    const projectBatch = batches.find((b) =>
      b.some((s) => s.sql.includes("INSERT INTO project")),
    );
    expect(projectBatch).toBeDefined();

    const phaseBatch = batches.find((b) =>
      b.some((s) => s.sql.includes("INSERT INTO phase")),
    );
    expect(phaseBatch).toBeDefined();

    const allocationBatch = batches.find((b) =>
      b.some((s) => s.sql.includes("INSERT INTO allocation")),
    );
    expect(allocationBatch).toBeDefined();

  });

  it("rejects confirming a non-draft import", async () => {
    const db = makeDb();

    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => {
          if (sql.toLowerCase().includes("timeline_import")) {
            return { id: params[0], status: "confirmed" };
          }
          return undefined;
        }),
        run: vi.fn(async () => ({ success: true })),
      })),
    }));

    const res = await confirmImport(db, "imp-1", {
      project_mappings: [],
      person_mappings: [],
    });
    expect(res.status).toBe(400);
  });

  it("skips rows with skipped person mapping", async () => {
    const db = makeDb();

    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.toLowerCase().includes("timeline_import_row")) {
            return {
              results: [
                {
                  row_number: 1,
                  raw: JSON.stringify({
                    project_name: "Apollo",
                    phase_name: "Design",
                    start_date: "2026-10-01",
                    end_date: "2026-10-31",
                    person_email: "alice@example.com",
                    person_name: "Alice",
                  }),
                },
              ],
            };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.toLowerCase().includes("timeline_import")) {
            return { id: params[0], status: "draft" };
          }
          return undefined;
        }),
        run: vi.fn(async () => ({ success: true })),
      })),
    }));

    const res = await confirmImport(db, "imp-1", {
      project_mappings: [
        { key: "Apollo", action: "create", code: "apollo", name: "Apollo" },
      ],
      person_mappings: [
        { key: "alice@example.com", action: "skip" },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.allocations_created).toBe(0);
    expect(body.rows_skipped).toBe(1);
  });
});
