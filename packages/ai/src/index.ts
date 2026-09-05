import { PlanningSnapshot, FactPack, AnalysisSubject } from "@kairo/types";

export interface BuildFactPackInput {
  snapshot: PlanningSnapshot;
  subject: AnalysisSubject;
}

// TODO(blueprint §10): construct closed fact sets from deterministic snapshot data.
export function buildFactPack(_input: BuildFactPackInput): FactPack {
  throw new Error("Phase 0 stub: not implemented");
}
