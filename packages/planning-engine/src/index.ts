import {
  PlanningInput,
  Project,
  FeasibilityResult,
  Alternative,
} from "@kairo/types";

export interface ComputeFeasibilityInput {
  input: PlanningInput;
  project: Project;
}

export interface GenerateAlternativesInput {
  input: PlanningInput;
  project: Project;
}

// TODO(blueprint §9): implement constrained forward-pass feasibility.
export function computeFeasibility(
  _input: ComputeFeasibilityInput,
): FeasibilityResult {
  throw new Error("Phase 0 stub: not implemented");
}

// TODO(blueprint §9): implement alternative generation strategies.
export function generateAlternatives(
  _input: GenerateAlternativesInput,
): Alternative[] {
  throw new Error("Phase 0 stub: not implemented");
}
