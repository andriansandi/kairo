import {
  AllocationSchema,
  IsoDateSchema,
  type Allocation,
} from "@kairo/types";
import { z } from "zod";
import { PaginationQuerySchema } from "./common";

export const AllocationListQuerySchema = PaginationQuerySchema.extend({
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
});

export const CreateAllocationSchema = z.object({
  person_id: z.string().min(1),
  project_id: z.string().min(1),
  phase_id: z.string().optional(),
  fte: z.coerce.number().min(0).max(2),
  start_date: IsoDateSchema,
  end_date: IsoDateSchema,
  status: z.enum(["committed", "planned", "proposed"]).default("committed"),
  source: z.enum(["plane", "manual", "xls", "ai"]).default("manual"),
});

export const UpdateAllocationSchema = CreateAllocationSchema.partial();

export function mapAllocationRow(row: unknown): Allocation {
  const r = row as Record<string, unknown>;
  return AllocationSchema.parse({
    id: r.id,
    person_id: r.person_id,
    project_id: r.project_id,
    phase_id: r.phase_id,
    fte: r.fte,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    source: r.source,
  });
}

export function validateAllocationDates(start: string, end: string): void {
  if (end < start) {
    throw new Error("end_date must be on or after start_date");
  }
}

export function overlapsRange(
  start: string,
  end: string,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  const rangeStart = from ?? "0000-01-01";
  const rangeEnd = to ?? "9999-12-31";
  return start <= rangeEnd && end >= rangeStart;
}
