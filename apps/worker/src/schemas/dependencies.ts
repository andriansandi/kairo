import {
  DependencySchema,
  DependencyTypeSchema,
  type Dependency,
} from "@kairo/types";
import { z } from "zod";

export const DependencyQuerySchema = z.object({
  project_id: z.string().optional(),
});

export const CreateDependencySchema = z
  .object({
    from_project_id: z.string().optional(),
    from_phase_id: z.string().optional(),
    to_project_id: z.string().optional(),
    to_phase_id: z.string().optional(),
    type: DependencyTypeSchema,
    lag_days: z.coerce.number().int().default(0),
    source: z.enum(["plane", "manual"]).default("manual"),
  })
  .refine(
    (data) => {
      const fromSet = Number(!!data.from_project_id) + Number(!!data.from_phase_id);
      return fromSet === 1;
    },
    {
      message: "Exactly one of from_project_id or from_phase_id must be provided",
      path: ["from_project_id"],
    },
  )
  .refine(
    (data) => {
      const toSet = Number(!!data.to_project_id) + Number(!!data.to_phase_id);
      return toSet === 1;
    },
    {
      message: "Exactly one of to_project_id or to_phase_id must be provided",
      path: ["to_project_id"],
    },
  );

export function mapDependencyRow(row: unknown): Dependency {
  const r = row as Record<string, unknown>;
  return DependencySchema.parse({
    id: r.id,
    from_project_id: r.from_project_id,
    from_phase_id: r.from_phase_id,
    to_project_id: r.to_project_id,
    to_phase_id: r.to_phase_id,
    type: r.type,
    lag_days: r.lag_days,
    source: r.source,
  });
}
