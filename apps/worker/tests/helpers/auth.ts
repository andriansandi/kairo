import type { Env } from "../../src/env";
import { createSessionCookie } from "../../src/middleware/auth";

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

export const TEST_USER_ROW = {
  id: TEST_USER_ID,
  username: "test",
};

export function isUsersQuery(sql: string): boolean {
  const lower = sql.toLowerCase().replace(/\s+/g, " ");
  return lower.includes("from users") && lower.includes("where id");
}

export async function authCookie(): Promise<{ Cookie: string }> {
  const env = {
    AUTH_SECRET: "test-secret",
    ENV: "dev",
    VERSION: "test",
    DB: {} as D1Database,
    IMPORTS: {} as R2Bucket,
  } as Env;
  const cookie = await createSessionCookie(TEST_USER_ID, env);
  return { Cookie: `${cookie.name}=${cookie.value}` };
}
