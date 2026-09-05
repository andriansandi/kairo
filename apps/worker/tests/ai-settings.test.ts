import { describe, it, expect, vi } from "vitest";
import type { Env } from "../src/env";
import { createApp } from "../src/index";
import { authCookie, isUsersQuery, TEST_USER_ROW } from "./helpers/auth";

interface Statement {
  sql: string;
  params: unknown[];
}

function makeDb(initialSettings: Record<string, string> = {}) {
  const rows: Record<string, string> = { ...initialSettings };
  const statements: Statement[] = [];

  const makePrepared = (sql: string, params: unknown[]) => {
    statements.push({ sql, params });
    const lower = sql.toLowerCase();
    return {
      all: vi.fn(async () => {
        if (lower.includes("app_setting")) {
          if (lower.includes("where") && lower.includes("key")) {
            const key = params[0] as string;
            return rows[key]
              ? { results: [{ key, value: rows[key], updated_at: "x" }] }
              : { results: [] };
          }
          return {
            results: Object.entries(rows).map(([key, value]) => ({
              key,
              value,
              updated_at: "x",
            })),
          };
        }
        return { results: [] };
      }),
      first: vi.fn(async () => {
        if (isUsersQuery(sql)) return TEST_USER_ROW;
        if (lower.includes("app_setting")) {
          if (lower.includes("where") && lower.includes("key")) {
            const key = params[0] as string;
            return rows[key]
              ? { key, value: rows[key], updated_at: "x" }
              : undefined;
          }
          return undefined;
        }
        return undefined;
      }),
      run: vi.fn(async () => {
        if (lower.includes("insert into app_setting")) {
          rows[params[0] as string] = params[1] as string;
        } else if (lower.includes("update app_setting")) {
          rows[params[2] as string] = params[0] as string;
        }
        return { success: true };
      }),
    };
  };

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database & { getStatements: () => Statement[] };

  db.getStatements = () => statements;
  return db;
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

async function request(path: string, init: RequestInit, db: D1Database) {
  const app = createApp(buildEnv(db));
  const headers = new Headers(init.headers);
  headers.set("Cookie", (await authCookie()).Cookie);
  return app.fetch(
    new Request(`http://example.com/api/v1/${path}`, { ...init, headers }),
  );
}

describe("Settings", () => {
  it("GET returns defaults and hides api_key", async () => {
    const db = makeDb({
      ai_config: JSON.stringify({
        gateway_url: "http://localhost:1234",
        provider: "openai",
        model: "gpt-4",
        api_key: "secret",
      }),
    });
    const res = await request("settings", { method: "GET" }, db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ai_config).toEqual({
      configured: true,
      gateway_url: "http://localhost:1234",
      provider: "openai",
      model: "gpt-4",
    });
    expect(body).not.toHaveProperty("api_key");
    expect(body.ai_config).not.toHaveProperty("api_key");
  });

  it("PATCH preserves api_key when not in payload", async () => {
    const db = makeDb({
      ai_config: JSON.stringify({
        gateway_url: "http://localhost:1234",
        provider: "openai",
        model: "gpt-4",
        api_key: "secret",
      }),
    });
    const res = await request(
      "settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_config: { model: "gpt-5" } }),
      },
      db,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ai_config).toEqual({
      configured: true,
      gateway_url: "http://localhost:1234",
      provider: "openai",
      model: "gpt-5",
    });

    const st = db.getStatements();
    const update = st.find(
      (s) =>
        s.sql.toLowerCase().includes("update app_setting") &&
        s.params[2] === "ai_config",
    );
    expect(update).toBeDefined();
    const stored = JSON.parse(update?.params[0] as string);
    expect(stored.api_key).toBe("secret");
  });

  it("PATCH missing gateway marks ai_config unconfigured", async () => {
    const db = makeDb();
    const res = await request(
      "settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_config: { provider: "openai", model: "gpt-4" } }),
      },
      db,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const ai = body.ai_config as Record<string, unknown>;
    expect(ai.configured).toBe(false);
  });
});
