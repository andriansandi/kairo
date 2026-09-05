import {
  AllocationSchema,
  IsoDateSchema,
  PersonSchema,
  PersonSkillSchema,
  PtoEntrySchema,
  TeamSchema,
  type Allocation,
  type Person,
  type PersonSkill,
  type PtoEntry,
  type Team,
} from "@kairo/types";
import { z } from "zod";
import { fromJson } from "../db";
import { PaginationQuerySchema } from "./common";

export const PersonListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().optional(),
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const CreatePersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role_id: z.string().min(1),
  seniority: z.coerce.number().int().min(1).max(10).default(3),
  hours_per_day: z.coerce.number().min(0).max(24).default(8),
  overhead_pct: z.coerce.number().min(0).max(1).default(0.2),
  active: z.coerce.boolean().default(true),
});

export const UpdatePersonSchema = CreatePersonSchema.partial();

export const PersonSkillInputSchema = z.object({
  skill_id: z.string().min(1),
  level: z.coerce.number().int().min(1).max(4),
  source: z.enum(["manual", "import", "ai"]).default("manual"),
});

export const PutPersonSkillsSchema = z.object({
  skills: z.array(PersonSkillInputSchema),
});

export const PtoCreateSchema = z.object({
  start_date: IsoDateSchema,
  end_date: IsoDateSchema,
  type: z.enum(["pto", "holiday", "sick", "other"]).default("pto"),
});

export type PersonWithRefs = Person & {
  role_name: string;
  team_ids: string[];
};

export function mapPersonRow(row: unknown): Person {
  const r = row as Record<string, unknown>;
  return PersonSchema.parse({
    id: r.id,
    name: r.name,
    email: r.email,
    role_id: r.role_id,
    seniority: r.seniority,
    hours_per_day: r.hours_per_day,
    overhead_pct: r.overhead_pct,
    active: Boolean(r.active),
  });
}

export function mapPersonWithRefs(
  person: Person,
  roleName: string,
  teamIds: string[],
): PersonWithRefs {
  return { ...person, role_name: roleName, team_ids: teamIds };
}

export function mapPersonSkillRow(row: unknown): PersonSkill {
  const r = row as Record<string, unknown>;
  return PersonSkillSchema.parse({
    id: r.id,
    person_id: r.person_id,
    skill_id: r.skill_id,
    level: r.level,
    verified_by: r.verified_by,
    source: r.source,
  });
}

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

export function mapTeamRow(row: unknown): Team {
  const r = row as Record<string, unknown>;
  return TeamSchema.parse({
    id: r.id,
    name: r.name,
    type: r.type,
  });
}

export function mapPtoRow(row: unknown): PtoEntry {
  const r = row as Record<string, unknown>;
  return PtoEntrySchema.parse({
    id: r.id,
    person_id: r.person_id,
    dates: fromJson(r.dates, []),
    type: r.type,
  });
}

export function ptoDatesFromRange(
  start: string,
  end: string,
): [string, string] {
  return [start, end];
}

export function validateDateOrder(
  start: string,
  end: string,
  label = "end_date",
): void {
  if (end < start) {
    throw new Error(`${label} must be on or after start_date`);
  }
}

export function assertUniqueSkills(
  skills: { skill_id: string }[],
): Map<string, number> {
  const seen = new Map<string, number>();
  skills.forEach((s, index) => {
    if (seen.has(s.skill_id)) {
      throw new Error(`Duplicate skill_id at index ${index}`);
    }
    seen.set(s.skill_id, index);
  });
  return seen;
}
