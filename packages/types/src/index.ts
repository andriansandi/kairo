import { z } from "zod";

// ----------------------------------------------------------------------------
// Shared primitives
// ----------------------------------------------------------------------------

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const IsoTimestampSchema = z.string().datetime();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

export const WeekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/);
export type WeekKey = z.infer<typeof WeekKeySchema>;

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

export const ProficiencyLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;

export const SkillWeightSchema = z.enum(["must", "nice"]);
export type SkillWeight = z.infer<typeof SkillWeightSchema>;

export const AllocationStatusSchema = z.enum([
  "committed",
  "planned",
  "proposed",
]);
export type AllocationStatus = z.infer<typeof AllocationStatusSchema>;

export const ConflictSeveritySchema = z.enum([
  "healthy",
  "warning",
  "at_risk",
  "critical",
]);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

export const ConflictRuleSchema = z.enum([
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
]);
export type ConflictRule = z.infer<typeof ConflictRuleSchema>;

export const FeasibilityVerdictSchema = ConflictSeveritySchema;
export type FeasibilityVerdict = z.infer<typeof FeasibilityVerdictSchema>;

export const TeamTypeSchema = z.enum(["builder", "devops", "other"]);
export type TeamType = z.infer<typeof TeamTypeSchema>;

export const DependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);
export type DependencyType = z.infer<typeof DependencyTypeSchema>;

export const EnvironmentSchema = z.enum(["dev", "staging", "prod"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

// ----------------------------------------------------------------------------
// Source — external
// ----------------------------------------------------------------------------

export const SyncRunSchema = z.object({
  id: z.string(),
  source: z.enum(["plane", "xls"]),
  type: z.enum(["incremental", "full"]),
  cursor: z.string().nullable(),
  status: z.enum(["running", "success", "partial", "failed"]),
  stats: z.record(z.unknown()).default({}),
  errors: z.array(z.unknown()).default([]),
  started_at: IsoTimestampSchema,
  finished_at: IsoTimestampSchema.nullable(),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

export const ProjectStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  plane_id: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  status: ProjectStatusSchema,
  priority: z.number().int().nullable(),
  deadline: IsoDateSchema.nullable(),
  declared_start: IsoDateSchema.nullable(),
  declared_end: IsoDateSchema.nullable(),
  team_scope: z.array(z.string()).default([]),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const WorkItemStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const WorkItemSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  plane_id: z.string(),
  title: z.string(),
  status: WorkItemStatusSchema,
  priority: z.number().int().nullable(),
  assignee_ids: z.array(z.string()).default([]),
  start_date: IsoDateSchema.nullable(),
  due_date: IsoDateSchema.nullable(),
  estimate_raw: z.string().nullable(),
  estimate_normalized_hours: z.number().nullable(),
  cycle: z.string().nullable(),
  labels: z.array(z.string()).default([]),
  updated_at: IsoTimestampSchema,
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const ProjectPhaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  sequence: z.number().int(),
  declared_start: IsoDateSchema,
  declared_end: IsoDateSchema,
  effort_hours: z.number().default(0),
  status: z.enum(["draft", "confirmed", "in_progress", "done"]).default("draft"),
  source: z.enum(["xls", "manual", "plane"]).default("manual"),
});
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;

export const TimelineImportSchema = z.object({
  id: z.string(),
  r2_key: z.string(),
  mapping: z.record(z.string()).default({}),
  row_report: z.array(z.record(z.unknown())).default([]),
  status: z.enum(["draft", "confirmed", "rejected"]).default("draft"),
  uploaded_by: z.string(),
  created_at: IsoTimestampSchema,
});
export type TimelineImport = z.infer<typeof TimelineImportSchema>;

export const DepedencySourceSchema = z.enum(["plane", "manual"]);
export type DependencySource = z.infer<typeof DepedencySourceSchema>;

export const DependencySchema = z.object({
  id: z.string(),
  from_project_id: z.string().nullable(),
  from_phase_id: z.string().nullable(),
  to_project_id: z.string().nullable(),
  to_phase_id: z.string().nullable(),
  type: DependencyTypeSchema,
  lag_days: z.number().int().default(0),
  source: DepedencySourceSchema,
});
export type Dependency = z.infer<typeof DependencySchema>;

// ----------------------------------------------------------------------------
// Source — KAIRO-managed
// ----------------------------------------------------------------------------

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role_id: z.string(),
  seniority: z.number().int(),
  hours_per_day: z.number().default(8),
  overhead_pct: z.number().min(0).max(1).default(0.2),
  active: z.boolean().default(true),
});
export type Person = z.infer<typeof PersonSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: TeamTypeSchema,
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamMembershipSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  team_id: z.string(),
});
export type TeamMembership = z.infer<typeof TeamMembershipSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  seniority_ladder: z.array(z.string()).default([]),
});
export type Role = z.infer<typeof RoleSchema>;

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  aliases: z.array(z.string()).default([]),
});
export type Skill = z.infer<typeof SkillSchema>;

export const PersonSkillSourceSchema = z.enum(["manual", "import", "ai"]);
export type PersonSkillSource = z.infer<typeof PersonSkillSourceSchema>;

export const PersonSkillSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  skill_id: z.string(),
  level: ProficiencyLevelSchema,
  verified_by: z.string().nullable(),
  source: PersonSkillSourceSchema,
});
export type PersonSkill = z.infer<typeof PersonSkillSchema>;

export const AllocationSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  project_id: z.string(),
  phase_id: z.string().nullable(),
  fte: z.number().min(0).max(2),
  start_date: IsoDateSchema,
  end_date: IsoDateSchema,
  status: AllocationStatusSchema,
  source: z.enum(["plane", "manual", "xls", "ai"]).default("manual"),
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const PtoEntrySchema = z.object({
  id: z.string(),
  person_id: z.string(),
  dates: z.array(IsoDateSchema),
  type: z.enum(["pto", "holiday", "sick", "other"]).default("pto"),
});
export type PtoEntry = z.infer<typeof PtoEntrySchema>;

export const OrgCalendarSchema = z.object({
  id: z.string(),
  workingDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  holidays: z.array(IsoDateSchema).default([]),
});
export type OrgCalendar = z.infer<typeof OrgCalendarSchema>;

export const JrSkillRequirementSourceSchema = z.enum([
  "manual",
  "ai_confirmed",
]);
export type JrSkillRequirementSource = z.infer<
  typeof JrSkillRequirementSourceSchema
>;

export const JrSkillRequirementSchema = z.object({
  id: z.string(),
  work_item_id: z.string(),
  skill_id: z.string(),
  min_level: ProficiencyLevelSchema,
  weight: SkillWeightSchema,
  source: JrSkillRequirementSourceSchema,
});
export type JrSkillRequirement = z.infer<typeof JrSkillRequirementSchema>;

// Scenario op definitions are moved below to avoid forward refs.

// ----------------------------------------------------------------------------
// Derived
// ----------------------------------------------------------------------------

export const PlanningSnapshotSchema = z.object({
  id: z.string(),
  created_at: IsoTimestampSchema,
  inputs_hash: z.string(),
  trigger: z.string().default("unknown"),
  notes: z.string().default(""),
});
export type PlanningSnapshot = z.infer<typeof PlanningSnapshotSchema>;

export const CapacityWeekEntrySchema = z.object({
  week_key: WeekKeySchema,
  person_id: z.string(),
  gross_h: z.number(),
  pto_h: z.number(),
  overhead_h: z.number(),
  available_h: z.number(),
  planned_h: z.number(),
  utilization: z.number(),
  flags: z.array(z.string()).default([]),
});
export type CapacityWeekEntry = z.infer<typeof CapacityWeekEntrySchema>;

export const ConflictSchema = z.object({
  id: z.string(),
  snapshot_id: z.string(),
  rule: ConflictRuleSchema,
  severity: ConflictSeveritySchema,
  person_id: z.string().nullable(),
  team_id: z.string().nullable(),
  project_id: z.string().nullable(),
  phase_id: z.string().nullable(),
  window_start: WeekKeySchema,
  window_end: WeekKeySchema,
  metrics: z.record(z.number()).default({}),
  explanation: z.string(),
  status: z.enum(["open", "acknowledged", "resolved"]).default("open"),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const MatchScoreBreakdownSchema = z.object({
  skill: z.number(),
  availability: z.number(),
  context: z.number(),
  role: z.number(),
});
export type MatchScoreBreakdown = z.infer<typeof MatchScoreBreakdownSchema>;

export const MatchResultSchema = z.object({
  id: z.string(),
  work_item_id: z.string(),
  person_id: z.string(),
  score: z.number(),
  breakdown: MatchScoreBreakdownSchema,
  gaps: z.array(z.string()).default([]),
  free_hours_in_window: z.number(),
  existing_commitments: z.number(),
  computed_at: IsoTimestampSchema,
  snapshot_id: z.string(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const FeasibilityResultSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  snapshot_id: z.string(),
  computed_start: IsoDateSchema,
  computed_finish: IsoDateSchema,
  slack_days: z.number(),
  buffer_days: z.number(),
  verdict: FeasibilityVerdictSchema,
  drivers: z.array(z.string()).default([]),
  critical_path: z.array(z.string()).default([]),
  per_phase_load: z.record(z.number()).default({}),
});
export type FeasibilityResult = z.infer<typeof FeasibilityResultSchema>;

// ----------------------------------------------------------------------------
// Scenario ops + scenario / alternative / diff
// ----------------------------------------------------------------------------

export const MoveProjectOpSchema = z.object({
  op: z.literal("move_project"),
  project_id: z.string(),
  weeks: z.number().int(),
});
export type MoveProjectOp = z.infer<typeof MoveProjectOpSchema>;

export const SetDeadlineOpSchema = z.object({
  op: z.literal("set_deadline"),
  project_id: z.string(),
  date: IsoDateSchema,
});
export type SetDeadlineOp = z.infer<typeof SetDeadlineOpSchema>;

export const AddAllocationOpSchema = z.object({
  op: z.literal("add_allocation"),
  person_id: z.string(),
  project_id: z.string(),
  phase_id: z.string().optional(),
  fte: z.number(),
  start_date: IsoDateSchema,
  end_date: IsoDateSchema,
});
export type AddAllocationOp = z.infer<typeof AddAllocationOpSchema>;

export const RemoveAllocationOpSchema = z.object({
  op: z.literal("remove_allocation"),
  allocation_id: z.string(),
});
export type RemoveAllocationOp = z.infer<typeof RemoveAllocationOpSchema>;

export const ChangeAllocationFteOpSchema = z.object({
  op: z.literal("change_allocation_fte"),
  allocation_id: z.string(),
  fte: z.number(),
});
export type ChangeAllocationFteOp = z.infer<typeof ChangeAllocationFteOpSchema>;

export const DeferWorkItemsOpSchema = z.object({
  op: z.literal("defer_work_items"),
  work_item_ids: z.array(z.string()),
});
export type DeferWorkItemsOp = z.infer<typeof DeferWorkItemsOpSchema>;

export const AddPersonSkillOpSchema = z.object({
  op: z.literal("add_person_skill"),
  person_id: z.string(),
  skill_id: z.string(),
  level: ProficiencyLevelSchema,
});
export type AddPersonSkillOp = z.infer<typeof AddPersonSkillOpSchema>;

export const ScenarioOpSchema = z.discriminatedUnion("op", [
  MoveProjectOpSchema,
  SetDeadlineOpSchema,
  AddAllocationOpSchema,
  RemoveAllocationOpSchema,
  ChangeAllocationFteOpSchema,
  DeferWorkItemsOpSchema,
  AddPersonSkillOpSchema,
]);
export type ScenarioOp = z.infer<typeof ScenarioOpSchema>;

export const ScenarioDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  base_snapshot_id: z.string(),
  ops: z.array(ScenarioOpSchema),
  created_by: z.string(),
  status: z.enum(["draft", "saved", "shared", "archived"]).default("draft"),
  created_at: IsoTimestampSchema,
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export const TradeOffSchema = z.object({
  kind: z.string(),
  value: z.string(),
  delta: z.record(z.number()).default({}),
});
export type TradeOff = z.infer<typeof TradeOffSchema>;

export const AlternativeStrategySchema = z.enum([
  "level_resources",
  "borrow_people",
  "resequence",
  "extend_deadline",
  "reduce_scope",
]);
export type AlternativeStrategy = z.infer<typeof AlternativeStrategySchema>;

export const AlternativeSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  snapshot_id: z.string(),
  strategy: AlternativeStrategySchema,
  changes: z.array(ScenarioOpSchema),
  trade_offs: z.array(TradeOffSchema),
  computed_finish: IsoDateSchema,
  buffer_days: z.number(),
});
export type Alternative = z.infer<typeof AlternativeSchema>;

export const ScenarioDiffSchema = z.object({
  id: z.string(),
  base_snapshot_id: z.string(),
  scenario_id: z.string(),
  capacity_deltas: z.record(z.number()).default({}),
  conflict_changes: z
    .object({
      created: z.array(ConflictSchema),
      resolved: z.array(ConflictSchema),
    })
    .default({ created: [], resolved: [] }),
  feasibility_deltas: z
    .record(
      z.object({
        before: FeasibilityVerdictSchema,
        after: FeasibilityVerdictSchema,
        finish_delta_days: z.number(),
      }),
    )
    .default({}),
});
export type ScenarioDiff = z.infer<typeof ScenarioDiffSchema>;

// ----------------------------------------------------------------------------
// AI-generated
// ----------------------------------------------------------------------------

export const AnalysisKindSchema = z.enum([
  "explain",
  "recommend",
  "compare",
  "qa",
]);
export type AnalysisKind = z.infer<typeof AnalysisKindSchema>;

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const AnalysisSubjectSchema = z.object({
  type: z.string(),
  id: z.string(),
});
export type AnalysisSubject = z.infer<typeof AnalysisSubjectSchema>;

export const AnalysisSchema = z.object({
  id: z.string(),
  snapshot_id: z.string(),
  kind: AnalysisKindSchema,
  subject: AnalysisSubjectSchema,
  prompt_digest: z.string(),
  provider: z.string(),
  model: z.string(),
  output: z.unknown(),
  validation_result: ValidationResultSchema,
  cited_fact_ids: z.array(z.string()).default([]),
  superseded: z.boolean().default(false),
  created_at: IsoTimestampSchema,
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const FactSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactPackSchema = z.object({
  snapshot_id: z.string(),
  generated_at: IsoTimestampSchema,
  facts: z.array(FactSchema),
});
export type FactPack = z.infer<typeof FactPackSchema>;

export const ProposedSkillRequirementSchema = z.object({
  skill_id: z.string(),
  min_level: ProficiencyLevelSchema,
  weight: SkillWeightSchema,
  confidence: z.number(),
});
export type ProposedSkillRequirement = z.infer<
  typeof ProposedSkillRequirementSchema
>;

export const SkillExtractionSchema = z.object({
  id: z.string(),
  work_item_id: z.string(),
  proposed: z.array(ProposedSkillRequirementSchema),
  confidence: z.number(),
  model: z.string().nullable(),
  created_at: IsoTimestampSchema,
});
export type SkillExtraction = z.infer<typeof SkillExtractionSchema>;

// ----------------------------------------------------------------------------
// API contract
// ----------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  env: EnvironmentSchema,
  timestamp: IsoTimestampSchema,
  db: z.enum(["ok", "error"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ----------------------------------------------------------------------------
// Aggregated snapshot input
// ----------------------------------------------------------------------------

export const PlanningInputSchema = z.object({
  snapshot: PlanningSnapshotSchema,
  people: z.array(PersonSchema),
  teams: z.array(TeamSchema),
  teamMemberships: z.array(TeamMembershipSchema),
  roles: z.array(RoleSchema),
  skills: z.array(SkillSchema),
  personSkills: z.array(PersonSkillSchema),
  projects: z.array(ProjectSchema),
  phases: z.array(ProjectPhaseSchema),
  workItems: z.array(WorkItemSchema),
  dependencies: z.array(DependencySchema),
  allocations: z.array(AllocationSchema),
  ptoEntries: z.array(PtoEntrySchema),
  calendar: OrgCalendarSchema,
  jrSkillRequirements: z.array(JrSkillRequirementSchema).default([]),
});
export type PlanningInput = z.infer<typeof PlanningInputSchema>;

// ----------------------------------------------------------------------------
// Re-exports of z for consumers that need to extend schemas
// ----------------------------------------------------------------------------

export { z };

// ----------------------------------------------------------------------------
// Phase 1 foundation additions (append-only)
// ----------------------------------------------------------------------------

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export function PaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};

export const SyncRunStatusSchema = z.enum([
  "running",
  "success",
  "partial",
  "failed",
]);
export type SyncRunStatus = z.infer<typeof SyncRunStatusSchema>;

export const TimelineImportStatusSchema = z.enum([
  "draft",
  "confirmed",
  "rejected",
]);
export type TimelineImportStatus = z.infer<typeof TimelineImportStatusSchema>;
