import { describe, it, expect, vi } from "vitest";
import type { Skill } from "@kairo/types";
import type { Env } from "../src/env";
import { createApp } from "../src/index";
import { authCookie, isUsersQuery, TEST_USER_ROW } from "./helpers/auth";

interface SkillRow {
  id: string;
  name: string;
  category: string;
  aliases: string;
  created_at: string;
  updated_at: string;
}

function makeDb(seed: SkillRow[] = []) {
  const rows = new Map<string, SkillRow>(seed.map((r) => [r.id, { ...r }]));

  function normalized(sql: string) {
    return sql.toLowerCase().replace(/\s+/g, " ");
  }

  function isSelectAll(sql: string) {
    const lower = normalized(sql);
    return lower.startsWith("select * from skill") && !lower.includes("where id");
  }

  function isSelectById(sql: string) {
    const lower = normalized(sql);
    return lower.includes("from skill") && lower.includes("where id");
  }

  function isSelectByName(sql: string) {
    const lower = normalized(sql);
    return lower.includes("select id from skill") && lower.includes("name");
  }

  const makePrepared = (sql: string, params: unknown[]) => ({
    all: vi.fn(async () => {
      if (isUsersQuery(sql)) return { results: [] };
      if (isSelectAll(sql)) {
        let list = Array.from(rows.values());
        if (params.length > 0) {
          const q = (params[0] as string).replace(/^%|%$/g, "").toLowerCase();
          list = list.filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              r.category.toLowerCase().includes(q),
          );
        }
        return { results: list };
      }
      return { results: [] };
    }),
    first: vi.fn(async <T>() => {
      if (isUsersQuery(sql)) return TEST_USER_ROW as T;
      if (isSelectById(sql)) {
        const id = params[0] as string;
        return (rows.get(id) as T | undefined) ?? undefined;
      }
      if (isSelectByName(sql)) {
        const name = params[0] as string;
        const found = Array.from(rows.values()).find(
          (r) => r.name.toLowerCase() === name.toLowerCase(),
        );
        return found ? ({ id: found.id } as T) : undefined;
      }
      return undefined as T;
    }),
    run: vi.fn(async () => {
      const lower = normalized(sql);
      if (lower.startsWith("insert into skill")) {
        const id = params[0] as string;
        rows.set(id, {
          id,
          name: params[1] as string,
          category: params[2] as string,
          aliases: params[3] as string,
          created_at: params[4] as string,
          updated_at: params[5] as string,
        });
      } else if (lower.startsWith("update skill")) {
        const id = params[params.length - 1] as string;
        const existing = rows.get(id);
        if (!existing) return { success: false };
        const setMatch = sql.match(/SET (.+?) WHERE/i);
        if (setMatch) {
          const assignments = setMatch[1].split(",").map((s) => s.trim());
          assignments.forEach((assignment, idx) => {
            const col = assignment.split("=")[0].trim();
            const value = params[idx];
            if (col === "name") existing.name = value as string;
            if (col === "category") existing.category = value as string;
            if (col === "aliases") existing.aliases = value as string;
            if (col === "updated_at") existing.updated_at = value as string;
          });
        }
      } else if (lower.startsWith("delete from skill")) {
        const id = params[0] as string;
        rows.delete(id);
      }
      return { success: true };
    }),
  });

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: unknown[]) => makePrepared(sql, params)),
    })),
    _rows: rows,
  } as unknown as D1Database & { _rows: Map<string, SkillRow> };
}

function buildEnv(db: D1Database): Env {
  return {
    DB: db,
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "test",
    AUTH_SECRET: "test-secret",
  };
}

async function postSkill(
  app: ReturnType<typeof createApp>,
  body: { name: string; category: string; aliases?: string[] },
  cookie: { Cookie: string },
) {
  return app.fetch(
    new Request("http://example.com/api/v1/skills", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookie,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/v1/skills", () => {
  it("creates a skill and returns it in the list", async () => {
    const db = makeDb();
    const app = createApp(buildEnv(db));
    const cookie = await authCookie();

    const res = await postSkill(
      app,
      { name: "React", category: "Frontend", aliases: ["ReactJS"] },
      cookie,
    );
    expect(res.status).toBe(200);
    const created = (await res.json()) as Skill;
    expect(created.name).toBe("React");

    const list = await app.fetch(
      new Request("http://example.com/api/v1/skills", { headers: cookie }),
    );
    expect(list.status).toBe(200);
    const items = (await list.json()) as Skill[];
    expect(items.map((s) => s.name)).toContain("React");
  });

  it("rejects a duplicate skill name with 400", async () => {
    const db = makeDb();
    const app = createApp(buildEnv(db));
    const cookie = await authCookie();
    const body = { name: "Node.js", category: "Backend" };

    const first = await postSkill(app, body, cookie);
    expect(first.status).toBe(200);

    const second = await postSkill(app, body, cookie);
    expect(second.status).toBe(400);
    const dupBody = (await second.json()) as { error?: { code: string } };
    expect(dupBody.error?.code).toBe("bad_request");
  });

  it("updates a skill and changes updated_at", async () => {
    const db = makeDb([
      {
        id: "s1",
        name: "Old",
        category: "Cat",
        aliases: "[]",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const app = createApp(buildEnv(db));
    const cookie = await authCookie();

    const res = await app.fetch(
      new Request("http://example.com/api/v1/skills/s1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...cookie,
        },
        body: JSON.stringify({ name: "New", category: "NewCat" }),
      }),
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Skill;
    expect(updated.name).toBe("New");
    expect(updated.category).toBe("NewCat");
    expect(db._rows.get("s1")!.updated_at).not.toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("deletes a skill and returns 404 on re-delete", async () => {
    const db = makeDb([
      {
        id: "s1",
        name: "React",
        category: "Frontend",
        aliases: "[]",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const app = createApp(buildEnv(db));
    const cookie = await authCookie();

    const first = await app.fetch(
      new Request("http://example.com/api/v1/skills/s1", {
        method: "DELETE",
        headers: cookie,
      }),
    );
    expect(first.status).toBe(204);

    const second = await app.fetch(
      new Request("http://example.com/api/v1/skills/s1", {
        method: "DELETE",
        headers: cookie,
      }),
    );
    expect(second.status).toBe(404);
  });

  it("filters skills by q", async () => {
    const db = makeDb([
      {
        id: "s1",
        name: "React",
        category: "Frontend",
        aliases: "[]",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "s2",
        name: "Node.js",
        category: "Backend",
        aliases: "[]",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const app = createApp(buildEnv(db));
    const cookie = await authCookie();

    const res = await app.fetch(
      new Request("http://example.com/api/v1/skills?q=react", {
        headers: cookie,
      }),
    );
    expect(res.status).toBe(200);
    const items = (await res.json()) as Skill[];
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("React");
  });

  it("returns 401 without a session cookie", async () => {
    const db = makeDb();
    const app = createApp(buildEnv(db));

    const res = await app.fetch(
      new Request("http://example.com/api/v1/skills"),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { message: string } };
    expect(body.error?.message).toBe("Authentication required");
  });
});
