export interface Env {
  DB: D1Database;
  IMPORTS: R2Bucket;
  ENV: "dev" | "staging" | "prod";
  VERSION: string;
}

declare module "hono" {
  interface ContextVariableMap {
    env: Env;
    db: D1Database;
  }
}
