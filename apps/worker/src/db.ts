export function all<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return db.prepare(sql).bind(...params).all<T>().then((r) => r.results ?? []);
}

export function first<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...params)
    .first<T | undefined>()
    .then((r) => r ?? null);
}

export function run(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJson<T>(col: unknown, fallback: T): T {
  if (typeof col !== "string" || col === "") return fallback;
  try {
    return JSON.parse(col) as T;
  } catch {
    return fallback;
  }
}
