import { SkillSchema, type Skill } from "@kairo/types";
import { z } from "zod";
import { fromJson } from "../db";

export const CreateSkillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});

export const UpdateSkillSchema = CreateSkillSchema.partial();

export const SkillQuerySchema = z.object({
  q: z.string().optional(),
});

export function mapSkillRow(row: unknown): Skill {
  const r = row as Record<string, unknown>;
  return SkillSchema.parse({
    id: r.id,
    name: r.name,
    category: r.category,
    aliases: fromJson(r.aliases, []),
  });
}
