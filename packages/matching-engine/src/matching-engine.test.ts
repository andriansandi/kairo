import { describe, expect, it } from "vitest";
import { Person, PersonSkill, Allocation, Skill, CapacityWeekEntry } from "@kairo/types";
import {
  DEFAULT_MATCH_WEIGHTS,
  MatchRequest,
  computeSkillCoverage,
  matchWorkItem,
} from "./index";

const alphaId = "proj-alpha";
const drupalId = "skill-drupal";
const phpId = "skill-php";
const qaId = "skill-qa";
const riskyId = "skill-risky";
const solidId = "skill-solid";

const people: Person[] = [
  {
    id: "dana",
    name: "Dana",
    email: "dana@example.com",
    role_id: "role-sr-fullstack",
    seniority: 4,
    hours_per_day: 8,
    overhead_pct: 0.2,
    active: true,
  },
  {
    id: "edo",
    name: "Edo",
    email: "edo@example.com",
    role_id: "role-mid-backend",
    seniority: 2,
    hours_per_day: 8,
    overhead_pct: 0.2,
    active: true,
  },
  {
    id: "fia",
    name: "Fia",
    email: "fia@example.com",
    role_id: "role-qa",
    seniority: 3,
    hours_per_day: 8,
    overhead_pct: 0.2,
    active: true,
  },
];

const skills: Skill[] = [
  { id: drupalId, name: "Drupal", category: "backend", aliases: [] },
  { id: phpId, name: "PHP", category: "backend", aliases: [] },
  { id: qaId, name: "QA", category: "qa", aliases: [] },
  { id: riskyId, name: "Risky Skill", category: "ops", aliases: [] },
  { id: solidId, name: "Solid Skill", category: "ops", aliases: [] },
];

const personSkills: PersonSkill[] = [
  { id: "ps1", person_id: "dana", skill_id: drupalId, level: 4, verified_by: null, source: "manual" },
  { id: "ps2", person_id: "dana", skill_id: phpId, level: 3, verified_by: null, source: "manual" },
  { id: "ps3", person_id: "edo", skill_id: drupalId, level: 2, verified_by: null, source: "manual" },
  { id: "ps4", person_id: "edo", skill_id: phpId, level: 3, verified_by: null, source: "manual" },
  { id: "ps5", person_id: "fia", skill_id: qaId, level: 3, verified_by: null, source: "manual" },
  { id: "ps6", person_id: "fia", skill_id: drupalId, level: 2, verified_by: null, source: "manual" },
  { id: "ps7", person_id: "dana", skill_id: riskyId, level: 3, verified_by: null, source: "manual" },
];

const allocations: Allocation[] = [
  {
    id: "a1",
    person_id: "dana",
    project_id: alphaId,
    phase_id: null,
    fte: 0.3,
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    status: "committed",
    source: "manual",
  },
];

const ledgerDana30Free: CapacityWeekEntry[] = [
  { week_key: "2026-W37", person_id: "dana", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 26, utilization: 0.8125, flags: [] },
  { week_key: "2026-W38", person_id: "dana", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 8, utilization: 0.25, flags: [] },
];

describe("matchWorkItem", () => {
  it("matches the §7 worked example with formula-derived components", () => {
    const request: MatchRequest = {
      workItem: {
        id: "wi-1",
        title: "Drupal 10 module upgrades",
        estimate_hours: 80,
        start_date: "2026-09-07",
        due_date: "2026-09-20",
        project_id: alphaId,
        expected_role_id: "role-sr-fullstack",
      },
      requirements: [
        { skill_id: drupalId, min_level: 3, weight: "must" },
        { skill_id: phpId, min_level: 2, weight: "must" },
        { skill_id: qaId, min_level: 1, weight: "nice" },
      ],
      people,
      personSkills,
      allocations,
      ledger: ledgerDana30Free,
      now: "2026-09-07",
    };

    const results = matchWorkItem(request);
    const dana = results.find((r) => r.person_id === "dana");
    const edo = results.find((r) => r.person_id === "edo");

    expect(dana).toBeDefined();
    expect(dana!.filtered).toBe(false);
    expect(dana!.components.skill).toBe(100);
    expect(dana!.components.availability).toBe(37.5);
    expect(dana!.components.context).toBe(100);
    expect(dana!.components.role).toBe(100);

    const expectedScore =
      DEFAULT_MATCH_WEIGHTS.skill * 100 +
      DEFAULT_MATCH_WEIGHTS.availability * 37.5 +
      DEFAULT_MATCH_WEIGHTS.context * 100 +
      DEFAULT_MATCH_WEIGHTS.role * 100;
    expect(dana!.score).toBe(Math.round(expectedScore * 10) / 10);
    expect(dana!.score).toBe(78.1);

    expect(edo).toBeDefined();
    expect(edo!.filtered).toBe(true);
    expect(edo!.filter_reason).toContain(drupalId);
    expect(edo!.gaps).toContainEqual({
      skill_id: drupalId,
      required_level: 3,
      actual_level: 2,
    });
  });

  it("tolerates nice-to-have missing skills and does not filter", () => {
    const request: MatchRequest = {
      workItem: {
        id: "wi-2",
        title: "PHP work",
        estimate_hours: 20,
        start_date: "2026-09-07",
        due_date: "2026-09-20",
        project_id: alphaId,
      },
      requirements: [
        { skill_id: phpId, min_level: 2, weight: "must" },
        { skill_id: qaId, min_level: 1, weight: "nice" },
      ],
      people,
      personSkills,
      allocations,
      ledger: ledgerDana30Free,
      now: "2026-09-07",
    };

    const results = matchWorkItem(request);
    const dana = results.find((r) => r.person_id === "dana")!;
    expect(dana.filtered).toBe(false);
    expect(dana.gaps).toContainEqual({
      skill_id: qaId,
      required_level: 1,
      actual_level: null,
    });
  });

  it("uses availability, context and role only when requirements are empty", () => {
    const request: MatchRequest = {
      workItem: {
        id: "wi-3",
        title: "Generic task",
        estimate_hours: 40,
        start_date: "2026-09-07",
        due_date: "2026-09-20",
        project_id: alphaId,
      },
      requirements: [],
      people,
      personSkills,
      allocations,
      ledger: ledgerDana30Free,
      now: "2026-09-07",
    };

    const results = matchWorkItem(request);
    const dana = results.find((r) => r.person_id === "dana")!;
    expect(dana.components.skill).toBe(0);
    expect(dana.filtered).toBe(false);
    expect(dana.components.availability).toBe(75);
  });

  it("filters a zero-free candidate when an estimate is present", () => {
    const request: MatchRequest = {
      workItem: {
        id: "wi-4",
        title: "Demanding task",
        estimate_hours: 80,
        start_date: "2026-09-07",
        due_date: "2026-09-20",
        project_id: alphaId,
      },
      requirements: [{ skill_id: phpId, min_level: 2, weight: "must" }],
      people,
      personSkills,
      allocations,
      ledger: [
        { week_key: "2026-W37", person_id: "edo", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 32, utilization: 1, flags: [] },
        { week_key: "2026-W38", person_id: "edo", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 32, utilization: 1, flags: [] },
      ],
      now: "2026-09-07",
    };

    const results = matchWorkItem(request);
    const edo = results.find((r) => r.person_id === "edo")!;
    expect(edo.filtered).toBe(true);
    expect(edo.filter_reason).toContain("No free capacity");
    expect(edo.free_hours_in_window).toBe(0);
  });

  it("reports gaps with null actual_level for completely missing skills", () => {
    const request: MatchRequest = {
      workItem: {
        id: "wi-5",
        title: "QA task",
        estimate_hours: 10,
        start_date: "2026-09-07",
        due_date: "2026-09-20",
        project_id: alphaId,
      },
      requirements: [
        { skill_id: qaId, min_level: 2, weight: "must" },
        { skill_id: drupalId, min_level: 1, weight: "nice" },
      ],
      people: [people[0]], // Dana only
      personSkills,
      allocations,
      ledger: ledgerDana30Free,
      now: "2026-09-07",
    };

    const results = matchWorkItem(request);
    const dana = results[0];
    expect(dana.gaps).toEqual([
      { skill_id: qaId, required_level: 2, actual_level: null },
    ]);
  });
});

describe("computeSkillCoverage", () => {
  it("counts proficiency levels, free hours, and detects single points of failure", () => {
    const coveragePeople: Person[] = [
      { id: "p1", name: "P1", email: "p1@example.com", role_id: "r1", seniority: 1, hours_per_day: 8, overhead_pct: 0.2, active: true },
      { id: "p2", name: "P2", email: "p2@example.com", role_id: "r1", seniority: 1, hours_per_day: 8, overhead_pct: 0.2, active: true },
      { id: "p3", name: "P3", email: "p3@example.com", role_id: "r1", seniority: 1, hours_per_day: 8, overhead_pct: 0.2, active: true },
    ];

    const coverageSkills: PersonSkill[] = [
      { id: "s1", person_id: "p1", skill_id: riskyId, level: 4, verified_by: null, source: "manual" },
      { id: "s2", person_id: "p2", skill_id: riskyId, level: 2, verified_by: null, source: "manual" },
      { id: "s3", person_id: "p1", skill_id: solidId, level: 3, verified_by: null, source: "manual" },
      { id: "s4", person_id: "p2", skill_id: solidId, level: 3, verified_by: null, source: "manual" },
      { id: "s5", person_id: "p3", skill_id: solidId, level: 1, verified_by: null, source: "manual" },
    ];

    const coverageLedger: CapacityWeekEntry[] = [
      { week_key: "2026-W37", person_id: "p1", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 20, utilization: 0.625, flags: [] },
      { week_key: "2026-W37", person_id: "p2", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 32, utilization: 1, flags: [] },
      { week_key: "2026-W37", person_id: "p3", gross_h: 40, pto_h: 0, overhead_h: 8, available_h: 32, planned_h: 0, utilization: 0, flags: [] },
    ];

    const result = computeSkillCoverage({
      skills,
      people: coveragePeople,
      personSkills: coverageSkills,
      ledger: coverageLedger,
    });

    const risky = result.find((s) => s.skill_id === riskyId)!;
    expect(risky.level_counts).toEqual([0, 1, 0, 1]);
    expect(risky.total_people).toBe(2);
    expect(risky.free_hours).toBe(12); // p1: 12, p2: 0
    expect(risky.spof).toBe(true); // one person at level >= 3

    const solid = result.find((s) => s.skill_id === solidId)!;
    expect(solid.level_counts).toEqual([1, 0, 2, 0]);
    expect(solid.total_people).toBe(3);
    expect(solid.free_hours).toBe(44); // p1: 12, p2: 0, p3: 32
    expect(solid.spof).toBe(false); // two people at level >= 3
  });
});
