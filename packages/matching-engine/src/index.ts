import { PlanningInput, WorkItem, IsoDate, MatchResult } from "@kairo/types";

export interface MatchWorkItemInput {
  input: PlanningInput;
  workItem: WorkItem;
  windowStart: IsoDate;
  windowEnd: IsoDate;
}

// TODO(blueprint §7): implement skill/availability/context/role scoring.
export function matchWorkItem(_input: MatchWorkItemInput): MatchResult[] {
  throw new Error("Phase 0 stub: not implemented");
}
