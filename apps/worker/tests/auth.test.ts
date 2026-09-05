import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { AuthUserSchema, type AuthUser } from "@kairo/types";
import type { Env } from "../src/env";
import { HTTPException } from "../src/http";
import { authRouter } from "../src/routes/auth";
import { requireAuth } from "../src/middleware/auth";
import {
  verifyPassword,
  createSessionCookie,
  verifySessionToken,
} from "../src/middleware/auth";

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

function makeDb(initial: UserRow[] = []) {
  const users = new Map(initial.map((u) => [u.id, { ...u }]));

  const prepare = vi.fn((sql: string) => {
    let boundParams: unknown[] = [];
    const stmt = {
      bind: vi.fn((...params: unknown[]) => {
        boundParams = params;
        return stmt;
      }),
      first: vi.fn(async <T>() => {
        const lower = sql.toLowerCase();
        if (lower.includes("from users where username")) {
          const username = (boundParams[0] as string).toLowerCase();
          const row = Array.from(users.values()).find(
            (u) => u.username.toLowerCase() === username,
          );
          return row ? ({ ...row } as T) : undefined;
        }
        if (lower.includes("from users where id")) {
          const row = users.get(boundParams[0] as string);
          return row ? ({ ...row } as T) : undefined;
        }
        return undefined as T;
      }),
      all: vi.fn(async <T>() => ({ results: [] as T[] })),
      run: vi.fn(async () => {
        const lower = sql.toLowerCase();
        if (lower.includes("update users set password_hash")) {
          const newHash = boundParams[0] as string;
          const id = boundParams[1] as string;
          const user = users.get(id);
          if (user) user.password_hash = newHash;
        }
        return { success: true };
      }),
    };
    return stmt;
  });

  return {
    prepare,
    _users: users,
  } as unknown as D1Database & { _users: Map<string, UserRow> };
}

function buildEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "0.0.0-test",
    AUTH_SECRET: "test-secret",
    ...overrides,
  };
}

function makeAuthApp(env: Env) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("db", env.DB);
    await next();
  });
  app.route("/api/v1/auth", authRouter);
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status as any,
      );
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: { code: "internal_error", message } }, 500);
  });
  return app;
}

async function json(res: Response) {
  return (await res.json()) as {
    ok?: boolean;
    user?: AuthUser;
    error?: { code: string; message: string };
  };
}

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_HASH =
  "pbkdf2$100000$2603271d1655924a871af7281d3c2718$7a41816ef4c19d9d6713984b4fbbf8cf57c340616d7434851f4c5a0d557c3249";

function makeDefaultDb() {
  return makeDb([
    { id: ADMIN_ID, username: "admin", password_hash: ADMIN_HASH },
  ]);
}

describe("POST /api/v1/auth/login", () => {
  it("returns user and sets session cookie on valid credentials", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const app = makeAuthApp(env);

    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const user = AuthUserSchema.parse(body.user);
    expect(user.username).toBe("admin");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("kairo_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("trims username before matching", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const app = makeAuthApp(env);

    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "  admin  ", password: "admin" }),
      }),
    );

    expect(res.status).toBe(200);
    const trimmedBody = await json(res);
    expect(trimmedBody.user?.username).toBe("admin");
  });

  it("returns 401 for wrong password", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const app = makeAuthApp(env);

    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      }),
    );

    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error?.code).toBe("unauthorized");
    expect(body.error?.message).toBe("Invalid username or password");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 without a cookie", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const app = makeAuthApp(env);

    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/me"),
    );

    expect(res.status).toBe(401);
    const noCookieBody = await json(res);
    expect(noCookieBody.error?.message).toBe("Authentication required");
  });

  it("returns user with a valid cookie", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/me", {
        headers: { Cookie: `${cookie.name}=${cookie.value}` },
      }),
    );

    expect(res.status).toBe(200);
    const meBody = await json(res);
    const user = AuthUserSchema.parse(meBody.user);
    expect(user.id).toBe(ADMIN_ID);
    expect(user.username).toBe("admin");
  });

  it("returns 401 when the hmac is tampered", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);
    // Flip the last hex char to a *different* value — appending "0" alone
    // would be a no-op 1/16 of the time (last HMAC nibble already "0").
    const last = cookie.value.slice(-1);
    const tampered = cookie.value.slice(0, -1) + (last === "0" ? "1" : "0");

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/me", {
        headers: { Cookie: `${cookie.name}=${tampered}` },
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const userId = ADMIN_ID;
    const expiresAt = 0;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`${userId}.${expiresAt}`)),
    );
    const hex = Array.from(sig)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiredToken = `${userId}.${expiresAt}.${hex}`;

    expect(await verifySessionToken(expiredToken, env)).toBeNull();

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/me", {
        headers: { Cookie: `kairo_session=${expiredToken}` },
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the session cookie", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/logout", {
        method: "POST",
        headers: { Cookie: `${cookie.name}=${cookie.value}` },
      }),
    );

    expect(res.status).toBe(200);
    const logoutBody = await json(res);
    expect(logoutBody.ok).toBe(true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("kairo_session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("PUT /api/v1/auth/password", () => {
  it("rejects wrong current password", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${cookie.name}=${cookie.value}`,
        },
        body: JSON.stringify({
          currentPassword: "wrong",
          newPassword: "new-password-123",
        }),
      }),
    );

    expect(res.status).toBe(401);
    const wrongCurrentBody = await json(res);
    expect(wrongCurrentBody.error?.code).toBe("unauthorized");
  });

  it("rejects a short new password", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${cookie.name}=${cookie.value}`,
        },
        body: JSON.stringify({
          currentPassword: "admin",
          newPassword: "short",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const shortBody = await json(res);
    expect(shortBody.error?.code).toBe("validation_error");
  });

  it("updates the stored password hash on success", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);
    const cookie = await createSessionCookie(ADMIN_ID, env);
    const oldHash = db._users.get(ADMIN_ID)!.password_hash;

    const app = makeAuthApp(env);
    const res = await app.fetch(
      new Request("http://example.com/api/v1/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${cookie.name}=${cookie.value}`,
        },
        body: JSON.stringify({
          currentPassword: "admin",
          newPassword: "new-password-123",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const user = AuthUserSchema.parse(body.user);
    expect(user.id).toBe(ADMIN_ID);

    const newHash = db._users.get(ADMIN_ID)!.password_hash;
    expect(newHash).not.toBe(oldHash);
    expect(await verifyPassword("new-password-123", newHash)).toBe(true);
    expect(await verifyPassword("admin", newHash)).toBe(false);
  });
});

describe("requireAuth middleware", () => {
  it("blocks a protected API route without a cookie", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);

    const app = new Hono();
    app.use("/api/*", async (c, next) => {
      c.set("env", env);
      c.set("db", env.DB);
      await next();
    });
    app.use("/api/*", requireAuth);
    app.get("/api/v1/people", (c) => c.json({ ok: true }));
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          err.status as any,
        );
      }
      return c.json({ error: { code: "internal_error", message: "error" } }, 500);
    });

    const res = await app.fetch(
      new Request("http://example.com/api/v1/people"),
    );

    expect(res.status).toBe(401);
    const protectedBody = await json(res);
    expect(protectedBody.error?.message).toBe("Authentication required");
  });

  it("allows the healthz allowlist without a cookie", async () => {
    const db = makeDefaultDb();
    const env = buildEnv(db);

    const app = new Hono();
    app.use("/api/*", async (c, next) => {
      c.set("env", env);
      c.set("db", env.DB);
      await next();
    });
    app.use("/api/*", requireAuth);
    app.get("/api/v1/healthz", (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request("http://example.com/api/v1/healthz"),
    );

    expect(res.status).toBe(200);
    const healthzBody = await json(res);
    expect(healthzBody.ok).toBe(true);
  });
});
