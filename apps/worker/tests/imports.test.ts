import { describe, it, expect, vi } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";
import { authCookie, isUsersQuery, TEST_USER_ROW } from "./helpers/auth";

function makeR2(): R2Bucket {
  return {
    put: vi.fn(async () => ({ key: "mock-key" })),
    delete: vi.fn(async () => undefined),
  } as unknown as R2Bucket;
}

interface Statement {
  sql: string;
  params: unknown[];
}

function makeDb() {
  const statements: Statement[] = [];
  const batches: Statement[][] = [];

  const makePrepared = (sql: string, params: unknown[]) => {
    statements.push({ sql, params });
    return {
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => {
        if (isUsersQuery(sql)) return TEST_USER_ROW;
        return undefined;
      }),
      run: vi.fn(async () => ({ success: true })),
    };
  };

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    batch: vi.fn(async (stmts: unknown[]) => {
      batches.push(stmts as Statement[]);
      return Array.isArray(stmts) ? stmts.map(() => ({ success: true })) : [];
    }),
  } as unknown as D1Database & {
    getStatements: () => Statement[];
    getBatches: () => Statement[][];
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
    AUTH_SECRET: "test-secret",
  };
}

async function postImport(
  db: D1Database,
  rows: unknown[],
  file?: File,
  r2?: R2Bucket,
) {
  const env = buildEnv(db, r2);
  const app = createApp(env);
  const form = new FormData();
  form.append("file", file ?? new File(["content"], "test.xlsx"));
  form.append("rows", JSON.stringify(rows));
  return app.fetch(new Request("http://example.com/api/v1/imports", {
    method: "POST",
    headers: await authCookie(),
    body: form,
  }));
}

describe("POST /api/v1/imports", () => {
  it("stores a valid import and returns counts", async () => {
    const db = makeDb();
    const r2 = makeR2();
    const rows = [
      {
        project_name: "Apollo",
        phase_name: "Design",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        person_email: "alice@example.com",
        person_name: "Alice",
        effort_hours: 80,
        fte: 0.5,
      },
    ];

    const res = await postImport(db, rows, undefined, r2);
    expect(res.status).toBe(201);

    const body = (await res.json()) as Record<string, any>;
    expect(body.counts).toEqual({ total: 1, valid: 1, warning: 0, error: 0 });
    expect(body.import.status).toBe("draft");
    expect(body.import.uploaded_by).toBe("local-dev");

    const inserts = db.getStatements();
    const importInsert = inserts.find((s) =>
      s.sql.includes("INSERT INTO timeline_import"),
    );
    expect(importInsert).toBeDefined();

    const rowInsert = inserts.find((s) =>
      s.sql.includes("INSERT INTO timeline_import_row"),
    );
    expect(rowInsert).toBeDefined();
    expect(rowInsert?.params[4]).toBe("valid");

    expect(r2.put).toHaveBeenCalledTimes(1);
  });

  it("records errors for invalid rows", async () => {
    const db = makeDb();
    const rows = [
      {
        project_name: "Apollo",
        phase_name: "Design",
        start_date: "not-a-date",
        end_date: "2026-10-01",
      },
    ];

    const res = await postImport(db, rows);
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, any>;
    expect(body.counts.error).toBe(1);
    expect(body.counts.valid).toBe(0);

    const rowInsert = db
      .getStatements()
      .find((s) => s.sql.includes("INSERT INTO timeline_import_row"));
    expect(rowInsert?.params[4]).toBe("error");
  });

  it("rejects non-multipart bodies", async () => {
    const db = makeDb();
    const env = buildEnv(db);
    const app = createApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authCookie()),
        },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/imports", () => {
  it("lists imports latest first", async () => {
    const db = makeDb();
    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        all: vi.fn(async () => ({
          results: [
            {
              id: "imp-2",
              status: "draft",
              row_report: JSON.stringify({
                counts: { total: 3, valid: 2, warning: 1, error: 0 },
              }),
              uploaded_by: "local-dev",
              created_at: "2026-09-05T10:00:00.000Z",
            },
          ],
        })),
        first: vi.fn(async () => {
          if (isUsersQuery(sql)) return TEST_USER_ROW;
          return undefined;
        }),
        run: vi.fn(async () => ({ success: true })),
      })),
    }));

    const env = buildEnv(db);
    const app = createApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/imports", {
        headers: await authCookie(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].counts.valid).toBe(2);
  });
});

describe("DELETE /api/v1/imports/:id", () => {
  it("deletes only draft imports", async () => {
    const db = makeDb();
    const r2 = makeR2();

    (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => ({
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => {
          if (isUsersQuery(sql)) return TEST_USER_ROW;
          if (sql.toLowerCase().includes("timeline_import")) {
            return {
              id: params[0],
              status: "draft",
              r2_key: "imports/imp-1/test.xlsx",
            };
          }
          return undefined;
        }),
        run: vi.fn(async () => ({ success: true })),
      })),
    }));

    const env = buildEnv(db, r2);
    const app = createApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/imports/imp-1", {
        method: "DELETE",
        headers: await authCookie(),
      }),
    );
    expect(res.status).toBe(204);
    expect(r2.delete).toHaveBeenCalledWith("imports/imp-1/test.xlsx");
  });
});
