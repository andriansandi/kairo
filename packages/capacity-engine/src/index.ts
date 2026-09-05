import {
  Person,
  Allocation,
  PtoEntry,
  OrgCalendar,
  CapacityWeekEntry,
  IsoDate,
} from "@kairo/types";

export interface BuildCapacityLedgerInput {
  people: Person[];
  allocations: Allocation[];
  ptoEntries: PtoEntry[];
  calendar: OrgCalendar;
  dateRange: { start: IsoDate; end: IsoDate };
}

// TODO(blueprint §6): implement working-day based capacity math.
export function buildCapacityLedger(
  _input: BuildCapacityLedgerInput,
): CapacityWeekEntry[] {
  throw new Error("Phase 0 stub: not implemented");
}
