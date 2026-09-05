import { PlanningInput, ScenarioOp, ScenarioDiff } from "@kairo/types";

// TODO(blueprint §11): implement typed scenario mutation + recomputation.
export function applyScenarioOps(
  baseInput: PlanningInput,
  _ops: ScenarioOp[],
): PlanningInput {
  // Return a shallow copy to signal mutation semantics; deep mutation Phase 6.
  throw new Error("Phase 0 stub: not implemented");
}

export interface DiffScenariosInput {
  base: PlanningInput;
  other: PlanningInput;
  scenarioId: string;
  baseSnapshotId: string;
}

// TODO(blueprint §11): implement capacity/conflict/feasibility diff.
export function diffScenarios(_input: DiffScenariosInput): ScenarioDiff {
  throw new Error("Phase 0 stub: not implemented");
}
