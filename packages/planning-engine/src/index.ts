import {
  Project,
  ProjectPhase,
  Allocation,
  Person,
  Dependency,
  OrgCalendar,
  WorkItem,
  ScenarioOp,
} from "@kairo/types";
import {
  isWorkingDay,
  nextWorkingDay,
  workingDaysBetween,
  addWorkingDays,
} from "@kairo/calendar";

const DAY_MS = 86_400_000;

export interface PhaseSchedule {
  phase_id: string;
  phase_name: string;
  computed_start: string;
  computed_finish: string;
  staffed_fte: number;
  effort_hours: number;
  duration_weeks: number;
}

export interface FeasibilityResult {
  project_id: string;
  computed_start: string;
  computed_finish: string;
  declared_finish: string | null;
  deadline: string | null;
  slack_days: number | null;
  buffer_days: number;
  verdict: "healthy" | "warning" | "at_risk" | "critical";
  drivers: string[];
  critical_path: string[];
  per_phase: PhaseSchedule[];
}

export interface FeasibilityInput {
  project: Project;
  phases: ProjectPhase[];
  allocations: Allocation[];
  people: Person[];
  dependencies: Dependency[];
  calendar: OrgCalendar;
  bufferTargetPct?: number;
  now?: string;
}

export interface Alternative {
  strategy: "level_resources" | "borrow_resources" | "extend_deadline" | "reduce_scope";
  description: string;
  ops: ScenarioOp[];
  tradeoffs: string[];
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  const year = String(d.getUTCFullYear()).padStart(4, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setTime(d.getTime() + n * DAY_MS);
  return formatDate(d);
}

function workingDaysPerWeek(calendar: OrgCalendar): number {
  return calendar.workingDays.length;
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS);
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function fteFromAllocations(
  phase: ProjectPhase,
  project: Project,
  allocations: Allocation[],
): number {
  return allocations
    .filter((a) => {
      if (a.project_id !== project.id) return false;
      if (a.phase_id && a.phase_id !== phase.id) return false;
      if (!a.phase_id) {
        // Project-level allocation counts if it overlaps the declared phase window.
        return overlaps(
          a.start_date,
          a.end_date,
          phase.declared_start,
          phase.declared_end,
        );
      }
      return true;
    })
    .reduce((sum, a) => sum + a.fte, 0);
}

function throughputForPhase(
  phase: ProjectPhase,
  project: Project,
  allocations: Allocation[],
  people: Person[],
  calendar: OrgCalendar,
): number {
  const personMap = new Map(people.map((p) => [p.id, p]));
  const fte = fteFromAllocations(phase, project, allocations);
  if (fte <= 0) return 0;
  const hpw = workingDaysPerWeek(calendar);

  let total = 0;
  for (const a of allocations) {
    if (a.project_id !== project.id) continue;
    if (a.phase_id && a.phase_id !== phase.id) continue;
    if (!a.phase_id) {
      if (
        !overlaps(
          a.start_date,
          a.end_date,
          phase.declared_start,
          phase.declared_end,
        )
      ) {
        continue;
      }
    }
    const person = personMap.get(a.person_id);
    if (!person) continue;
    total +=
      a.fte * person.hours_per_day * hpw * (1 - person.overhead_pct);
  }
  return round2(total);
}

export function computeFeasibility(input: FeasibilityInput): FeasibilityResult {
  const {
    project,
    phases,
    allocations,
    people,
    dependencies,
    calendar,
    bufferTargetPct = 0.15,
    now = "1970-01-01",
  } = input;

  const wdpw = workingDaysPerWeek(calendar);
  const sortedPhases = [...phases]
    .filter((p) => p.project_id === project.id)
    .sort((a, b) => a.sequence - b.sequence);

  const computedFinishes = new Map<string, string>();
  const perPhase: PhaseSchedule[] = [];
  const drivers: string[] = [];

  for (let i = 0; i < sortedPhases.length; i++) {
    const phase = sortedPhases[i];
    let computedStart = phase.declared_start;

    if (project.declared_start && project.declared_start > computedStart) {
      computedStart = project.declared_start;
    }
    if (now > computedStart) {
      computedStart = now;
    }
    if (i > 0) {
      const prevPhase = sortedPhases[i - 1];
      const prevFinish = computedFinishes.get(prevPhase.id)!;
      if (prevFinish > computedStart) {
        computedStart = prevFinish;
      }
    }

    // Internal same-project phase dependencies.
    for (const dep of dependencies) {
      if (dep.to_phase_id !== phase.id) continue;
      const fromPhase = dep.from_phase_id
        ? sortedPhases.find((p) => p.id === dep.from_phase_id)
        : undefined;
      const sameProject =
        dep.from_project_id === project.id || dep.from_project_id === null;
      if (fromPhase && sameProject) {
        const predFinish = computedFinishes.get(fromPhase.id);
        if (predFinish) {
          const lagged = nextWorkingDay(
            addDays(predFinish, dep.lag_days),
            calendar,
          );
          if (lagged > computedStart) computedStart = lagged;
        }
      } else if (!sameProject && dep.from_project_id) {
        drivers.push(
          `External dependency ${dep.id} from project ${dep.from_project_id} cannot be resolved`,
        );
      }
    }

    computedStart = nextWorkingDay(computedStart, calendar);

    const throughput = throughputForPhase(phase, project, allocations, people, calendar);
    let durationWeeks: number;

    if (phase.effort_hours > 0 && throughput > 0) {
      durationWeeks = Math.ceil(phase.effort_hours / throughput);
    } else {
      const declaredWorkingDays = workingDaysBetween(
        phase.declared_start,
        phase.declared_end,
        calendar,
      );
      durationWeeks =
        declaredWorkingDays > 0 ? Math.ceil(declaredWorkingDays / wdpw) : 0;
      if (phase.effort_hours > 0 && throughput === 0) {
        drivers.push(`Phase ${phase.name} has effort but no allocation`);
        if (durationWeeks < 1) durationWeeks = 1;
      }
    }

    // computed_finish is the next working day after adding duration_weeks × 7 calendar days.
    const rawFinish = addDays(computedStart, durationWeeks * 7);
    const computedFinish = nextWorkingDay(rawFinish, calendar);

    computedFinishes.set(phase.id, computedFinish);
    perPhase.push({
      phase_id: phase.id,
      phase_name: phase.name,
      computed_start: computedStart,
      computed_finish: computedFinish,
      staffed_fte: round2(fteFromAllocations(phase, project, allocations)),
      effort_hours: phase.effort_hours,
      duration_weeks: durationWeeks,
    });
  }

  const computedFinish = perPhase.length
    ? perPhase.reduce((max, p) => (p.computed_finish > max ? p.computed_finish : max), perPhase[0].computed_finish)
    : (project.declared_end ?? now);
  const computedStart = perPhase.length
    ? perPhase[0].computed_start
    : (project.declared_start ?? now);

  const maxPhaseDeclaredEnd = sortedPhases.length
    ? sortedPhases.reduce((max, p) => (p.declared_end > max ? p.declared_end : max), sortedPhases[0].declared_end)
    : null;
  const declaredFinish = project.declared_end ?? maxPhaseDeclaredEnd;

  const deadline = project.deadline ?? null;
  let slackDays: number | null = null;
  if (deadline) {
    if (computedFinish <= deadline) {
      slackDays = workingDaysBetween(computedFinish, deadline, calendar);
    } else {
      slackDays = -workingDaysBetween(deadline, computedFinish, calendar);
    }
  }

  const totalDurationWorkingDays = perPhase.reduce(
    (sum, p) => sum + p.duration_weeks * wdpw,
    0,
  );
  const bufferDays = Math.max(
    3,
    Math.ceil(bufferTargetPct * totalDurationWorkingDays),
  );

  const hasUnstaffedEffort = perPhase.some(
    (p) => p.effort_hours > 0 && p.staffed_fte === 0,
  );

  let verdict: FeasibilityResult["verdict"];
  if (!deadline) {
    verdict = hasUnstaffedEffort ? "at_risk" : "healthy";
  } else {
    const slack = slackDays ?? 0;
    if (slack >= bufferDays) {
      verdict = "healthy";
    } else if (slack >= 0) {
      verdict = "warning";
    } else {
      const overshoot = -slack;
      if (overshoot <= 10) {
        verdict = hasUnstaffedEffort ? "critical" : "at_risk";
      } else {
        verdict = "critical";
      }
    }
  }

  const criticalPath = sortedPhases.map((p) => p.id);

  return {
    project_id: project.id,
    computed_start: computedStart,
    computed_finish: computedFinish,
    declared_finish: declaredFinish,
    deadline,
    slack_days: slackDays,
    buffer_days: bufferDays,
    verdict,
    drivers,
    critical_path: criticalPath,
    per_phase: perPhase,
  };
}

export function generateAlternatives(input: {
  feasibility: FeasibilityInput;
  result: FeasibilityResult;
  workItems: WorkItem[];
  personFreeHours?: Record<string, number>;
}): Alternative[] {
  const { feasibility, result, workItems, personFreeHours = {} } = input;
  const { project, phases, allocations, people, calendar } = feasibility;
  const wdpw = workingDaysPerWeek(calendar);
  const alternatives: Alternative[] = [];

  const personMap = new Map(people.map((p) => [p.id, p]));
  const projectAllocs = allocations.filter((a) => a.project_id === project.id);
  const allocatedPersonIds = new Set(
    projectAllocs.map((a) => a.person_id),
  );

  // 1. Level resources within free capacity.
  const levelOps: ScenarioOp[] = [];
  const levelTradeoffs: string[] = [];
  if (Object.keys(personFreeHours).length > 0) {
    const usedPersonIds = new Set<string>();
    for (const alloc of projectAllocs) {
      if (usedPersonIds.has(alloc.person_id)) continue;
      const free = personFreeHours[alloc.person_id] ?? 0;
      if (free <= 0) continue;
      const person = personMap.get(alloc.person_id);
      if (!person) continue;
      const grossWeekly = person.hours_per_day * wdpw;
      if (grossWeekly <= 0) continue;
      const delta = Math.min(1 - alloc.fte, free / grossWeekly);
      if (delta > 0.001) {
        const newFte = round2(Math.min(1, alloc.fte + delta));
        levelOps.push({
          op: "change_allocation_fte",
          allocation_id: alloc.id,
          fte: newFte,
        });
        levelTradeoffs.push(
          `raises ${person.name} on ${alloc.phase_id ?? "project"} from ${alloc.fte} to ${newFte} FTE using ${round2(delta * grossWeekly)}h/week free capacity`,
        );
        usedPersonIds.add(alloc.person_id);
      }
    }
  }
  if (levelOps.length > 0) {
    alternatives.push({
      strategy: "level_resources",
      description: `Level ${levelOps.length} existing allocation(s) within free capacity`,
      ops: levelOps,
      tradeoffs: levelTradeoffs,
    });
  }

  // 2. Borrow a person with the largest free capacity.
  if (Object.keys(personFreeHours).length > 0) {
    let best: { person: Person; free: number } | null = null;
    for (const [personId, free] of Object.entries(personFreeHours)) {
      if (free <= 0) continue;
      if (allocatedPersonIds.has(personId)) continue;
      const person = personMap.get(personId);
      if (!person) continue;
      if (!best || free > best.free || (free === best.free && person.id < best.person.id)) {
        best = { person, free };
      }
    }

    if (best) {
      const start = result.computed_start;
      const end = result.computed_finish;
      alternatives.push({
        strategy: "borrow_resources",
        description: `Borrow ${best.person.name} at 0.50 FTE (${best.free}h free capacity)`,
        ops: [
          {
            op: "add_allocation",
            person_id: best.person.id,
            project_id: project.id,
            fte: 0.5,
            start_date: start,
            end_date: end,
          },
        ],
        tradeoffs: [
          `adds ${best.person.name} 0.50 FTE from ${start} to ${end}, consuming ${round2(0.5 * best.person.hours_per_day * wdpw)}h/week`,
        ],
      });
    }
  }

  // 3. Extend deadline.
  if (result.deadline && (result.verdict === "at_risk" || result.verdict === "critical")) {
    const overshootDays = result.slack_days !== null ? Math.max(0, -result.slack_days) : 0;
    const weeksNeeded = Math.ceil(
      (overshootDays + result.buffer_days) / wdpw,
    );
    const newDeadline = addWorkingDays(
      result.computed_finish,
      result.buffer_days,
      calendar,
    );
    alternatives.push({
      strategy: "extend_deadline",
      description: `Extend deadline by ${weeksNeeded} week(s) to restore ${result.buffer_days}-day buffer`,
      ops: [
        {
          op: "set_deadline",
          project_id: project.id,
          date: newDeadline,
        },
      ],
      tradeoffs: [
        `delays deadline by ${weeksNeeded} week(s) to ${newDeadline}`,
      ],
    });
  }

  // 4. Reduce scope.
  const overshootDays = result.slack_days !== null ? Math.max(0, -result.slack_days) : 0;
  const totalThroughput = result.per_phase.reduce(
    (sum, p) => sum + (p.effort_hours > 0 && p.duration_weeks > 0 ? p.effort_hours / p.duration_weeks : 0),
    0,
  );
  let targetHours = 0;
  if (overshootDays > 0) {
    const dailyRate = totalThroughput / wdpw;
    targetHours = dailyRate > 0 ? overshootDays * dailyRate : 0;
  }

  const deferrable = workItems
    .filter((wi) => wi.project_id === project.id)
    .filter((wi) => (wi.priority !== null && wi.priority >= 4) || wi.status === "backlog")
    .sort((a, b) => {
      const ea = a.estimate_normalized_hours ?? 0;
      const eb = b.estimate_normalized_hours ?? 0;
      return eb - ea || a.id.localeCompare(b.id);
    });

  const deferred: string[] = [];
  let recovered = 0;
  if (targetHours > 0) {
    for (const wi of deferrable) {
      if (recovered >= targetHours) break;
      const est = wi.estimate_normalized_hours ?? 0;
      if (est > 0) {
        deferred.push(wi.id);
        recovered += est;
      }
    }
  }

  const reduceOps: ScenarioOp[] =
    deferred.length > 0
      ? [
          {
            op: "defer_work_items",
            work_item_ids: deferred,
          },
        ]
      : [];
  const reduceTradeoffs: string[] = [];
  if (deferred.length > 0) {
    reduceTradeoffs.push(
      `defers ${deferred.length} item(s) worth ${round2(recovered)}h to recover ${round2(targetHours)}h overshoot-equivalent effort`,
    );
  } else {
    reduceTradeoffs.push("no deferrable work items available");
  }
  alternatives.push({
    strategy: "reduce_scope",
    description: `Defer lowest-value backlog work${deferred.length > 0 ? ` (${deferred.length} item(s))` : ""}`,
    ops: reduceOps,
    tradeoffs: reduceTradeoffs,
  });

  return alternatives;
}
