export interface Env {
  DB: D1Database;
  IMPORTS: R2Bucket;
  ENV: "dev" | "staging" | "prod";
  VERSION: string;
}
