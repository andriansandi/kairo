import { z } from "@kairo/types";
import { ProjectPhase, Allocation, IsoDate } from "@kairo/types";

export const TimelineRowSchema = z.object({
  project_code: z.string(),
  phase_name: z.string(),
  sequence: z.coerce.number().int(),
  declared_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  declared_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effort_hours: z.coerce.number().default(0),
  person_email: z.string().email().optional(),
  fte: z.coerce.number().min(0).max(2).optional(),
});

export type TimelineRow = z.infer<typeof TimelineRowSchema>;

export interface ParsedTimelineWorkbook {
  phases: ProjectPhase[];
  allocations: Allocation[];
  rows: TimelineRow[];
  errors: { row: number; message: string }[];
}

// TODO(blueprint §3.B, Phase 1): wire SheetJS/exceljs client-side parser;
// server-side this validates the same normalized shape.
export function parseTimelineWorkbook(_input: unknown): ParsedTimelineWorkbook {
  throw new Error("Phase 0 stub: not implemented");
}
