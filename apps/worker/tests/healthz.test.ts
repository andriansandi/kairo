import { describe, it, expect } from "vitest";
import { HealthResponseSchema } from "@kairo/types";
import type { Env } from "../src/env";
import { createApp } from "../src/index";

function buildEnv(shouldThrow = false): Env {
  const db = {
    prepare: () => ({
      first: async () => {
        if (shouldThrow) throw new Error("db down");
        return { ok: 1 };
      },
    }),
  } as unknown as D1Database;

  return {
    DB: db,
    IMPORTS: {} as unknown as R2Bucket,
    ENV: "dev",
    VERSION: "0.0.0.0-test",
  };
}

async function getHealth(env: Env) {
  return createApp(env).fetch(
    new Request("http://example.com/api/v1/healthz"),
  );
}

describe("GET /api/v1/healthz", () => {
  it("returns 200 and a valid HealthResponse when the DB is up", async () => {
    const res = await getHealth(buildEnv());
    expect(res.status).toBe(200);

    const body = HealthResponseSchema.parse(await res.json());
    expect(body.status).toBe("ok");
    expect(body.env).toBe("dev");
    expect(body.version).toBe("0.0.0.0-test");
    expect(body.db).toBe("ok");
  });

  it("marks db as error when the DB query throws", async () => {
    const res = await getHealth(buildEnv(true));
    expect(res.status).toBe(200);

    const body = HealthResponseSchema.parse(await res.json());
    expect(body.db).toBe("error");
  });
});
