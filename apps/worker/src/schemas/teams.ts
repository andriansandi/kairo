import { TeamSchema, type Team, TeamTypeSchema } from "@kairo/types";
import { z } from "zod";

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  type: TeamTypeSchema,
});

export const UpdateTeamSchema = CreateTeamSchema.partial();

export const AddTeamMemberSchema = z.object({
  person_id: z.string().min(1),
});

export type TeamWithMembers = Team & { member_ids: string[] };

export function mapTeamRow(row: unknown): Team {
  const r = row as Record<string, unknown>;
  return TeamSchema.parse({
    id: r.id,
    name: r.name,
    type: r.type,
  });
}

export function buildTeamWithMembers(
  team: Team,
  memberIds: string[],
): TeamWithMembers {
  return { ...team, member_ids: memberIds };
}
