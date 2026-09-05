import type { AuthUser } from "@kairo/types";

export interface Env {
  DB: D1Database;
  IMPORTS: R2Bucket;
  ENV: "dev" | "staging" | "prod";
  VERSION: string;
  AUTH_SECRET: string;
}

declare module "hono" {
  interface ContextVariableMap {
    env: Env;
    db: D1Database;
    user: AuthUser | null;
  }
}
