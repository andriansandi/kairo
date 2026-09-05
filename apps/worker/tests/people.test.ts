import { describe, it, expect } from "vitest";
import {
  assertUniqueSkills,
  mapPersonWithRefs,
  CreatePersonSchema,
  mapPersonRow,
  mapPersonSkillRow,
  mapPtoRow,
  PersonListQuerySchema,
  PutPersonSkillsSchema,
  PtoCreateSchema,
} from "../src/schemas/people";

describe("people schemas", () => {
  it("parses a person row", () => {
    const person = mapPersonRow({
      id: "p1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role_id: "r1",
      seniority: 4,
      hours_per_day: 8,
      overhead_pct: 0.2,
      active: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    expect(person.id).toBe("p1");
    expect(person.active).toBe(true);
    expect(person.hours_per_day).toBe(8);
  });

  it("maps active integer zero to false", () => {
    const person = mapPersonRow({
      id: "p2",
      name: "Alan Turing",
      email: "alan@example.com",
      role_id: "r1",
      seniority: 5,
      hours_per_day: 7,
      overhead_pct: 0.15,
      active: 0,
    });
    expect(person.active).toBe(false);
  });

  it("builds PersonWithRefs", () => {
    const person = mapPersonRow({
      id: "p3",
      name: "Grace Hopper",
      email: "grace@example.com",
      role_id: "r2",
      seniority: 5,
      hours_per_day: 8,
      overhead_pct: 0.2,
      active: 1,
    });
    const enriched = mapPersonWithRefs(person, "Engineer", ["t1", "t2"]);
    expect(enriched.role_name).toBe("Engineer");
    expect(enriched.team_ids).toEqual(["t1", "t2"]);
  });

  it("rejects invalid create bodies", () => {
    const result = CreatePersonSchema.safeParse({
      name: "",
      email: "not-an-email",
      role_id: "r1",
    });
    expect(result.success).toBe(false);
  });

  it("applies create defaults", () => {
    const result = CreatePersonSchema.parse({
      name: "Jane Doe",
      email: "jane@example.com",
      role_id: "r1",
    });
    expect(result.active).toBe(true);
    expect(result.hours_per_day).toBe(8);
    expect(result.overhead_pct).toBe(0.2);
    expect(result.seniority).toBe(3);
  });

  it("parses person list query with defaults", () => {
    const query = PersonListQuerySchema.parse({});
    expect(query.limit).toBe(50);
    expect(query.cursor).toBeUndefined();
    expect(query.q).toBeUndefined();
    expect(query.active).toBeUndefined();
  });

  it("coerces active string to boolean", () => {
    const qTrue = PersonListQuerySchema.parse({ active: "true" });
    expect(qTrue.active).toBe(true);
    const qFalse = PersonListQuerySchema.parse({ active: "false" });
    expect(qFalse.active).toBe(false);
  });

  it("maps person skill row", () => {
    const skill = mapPersonSkillRow({
      id: "ps1",
      person_id: "p1",
      skill_id: "s1",
      level: 3,
      verified_by: null,
      source: "manual",
    });
    expect(skill.level).toBe(3);
    expect(skill.source).toBe("manual");
  });

  it("replaces skills with valid levels", () => {
    const result = PutPersonSkillsSchema.parse({
      skills: [
        { skill_id: "s1", level: 4 },
        { skill_id: "s2", level: 2, source: "import" },
      ],
    });
    expect(result.skills[0].source).toBe("manual");
    expect(result.skills[1].source).toBe("import");
  });

  it("rejects skill level outside 1-4", () => {
    const result = PutPersonSkillsSchema.safeParse({
      skills: [{ skill_id: "s1", level: 5 }],
    });
    expect(result.success).toBe(false);
  });

  it("detects duplicate skill ids", () => {
    const skills = [
      { skill_id: "s1", level: 3 },
      { skill_id: "s1", level: 2 },
    ];
    expect(() => assertUniqueSkills(skills)).toThrow("Duplicate skill_id at index 1");
  });

  it("maps pto row from JSON dates", () => {
    const pto = mapPtoRow({
      id: "pto1",
      person_id: "p1",
      dates: '["2026-10-01","2026-10-05"]',
      type: "pto",
    });
    expect(pto.dates).toEqual(["2026-10-01", "2026-10-05"]);
  });

  it("validates pto date order", () => {
    const result = PtoCreateSchema.safeParse({
      start_date: "2026-10-05",
      end_date: "2026-10-01",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.end_date).toBe("2026-10-01");
  });
});
