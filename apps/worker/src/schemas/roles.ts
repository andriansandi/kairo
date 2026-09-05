import { RoleSchema, type Role } from "@kairo/types";
import { z } from "zod";
import { fromJson } from "../db";

export const CreateRoleSchema = z.object({
  name: z.string().min(1),
  seniority_ladder: z.array(z.string()).default([]),
});

export const UpdateRoleSchema = CreateRoleSchema.partial();

export function mapRoleRow(row: unknown): Role {
  const r = row as Record<string, unknown>;
  return RoleSchema.parse({
    id: r.id,
    name: r.name,
    seniority_ladder: fromJson(r.seniority_ladder, []),
  });
}
