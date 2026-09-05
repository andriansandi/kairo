import { z } from "zod";

export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset }));
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: number };
    return typeof parsed.o === "number" ? parsed.o : 0;
  } catch {
    return 0;
  }
}

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export function nextCursor<T>(
  rows: T[],
  limit: number,
  offset: number,
): string | null {
  if (rows.length > limit) return encodeCursor(offset + limit);
  return null;
}

export function slicePage<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit);
}
