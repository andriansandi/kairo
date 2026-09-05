import { describe, it, expect } from "vitest";
import {
  canonicalInputsString,
  fingerprintFromRows,
} from "../src/services/snapshot";

type RowsByTable = Record<string, [string, string][]>;

describe("fingerprintFromRows", () => {
  const base = {
    project: [
      ["p1", "2026-09-01T00:00:00.000Z"],
      ["p2", "2026-09-02T00:00:00.000Z"],
    ],
    person: [["pe1", "2026-08-01T00:00:00.000Z"]],
  } satisfies RowsByTable;

  it("is deterministic across identical inputs", async () => {
    const a = await fingerprintFromRows(base);
    const b = await fingerprintFromRows(base);
    expect(a).toBe(b);
  });

  it("orders tables canonically", async () => {
    const reordered = {
      person: [["pe1", "2026-08-01T00:00:00.000Z"]],
      project: [
        ["p1", "2026-09-01T00:00:00.000Z"],
        ["p2", "2026-09-02T00:00:00.000Z"],
      ],
    } satisfies RowsByTable;
    expect(await fingerprintFromRows(reordered)).toBe(
      await fingerprintFromRows(base),
    );
  });

  it("changes when any row changes", async () => {
    const changed = {
      ...base,
      project: [
        ["p1", "2026-09-01T00:00:00.000Z"],
        ["p2", "2026-09-03T00:00:00.000Z"],
      ],
    } satisfies RowsByTable;
    const original = await fingerprintFromRows(base);
    const after = await fingerprintFromRows(changed);
    expect(after).not.toBe(original);
  });

  it("changes when a row is added", async () => {
    const added = {
      ...base,
      person: [
        ["pe1", "2026-08-01T00:00:00.000Z"],
        ["pe2", "2026-08-01T00:00:00.000Z"],
      ],
    } satisfies RowsByTable;
    expect(await fingerprintFromRows(added)).not.toBe(
      await fingerprintFromRows(base),
    );
  });
});

describe("canonicalInputsString", () => {
  it("produces stable JSON independent of key insertion order", () => {
    const a = canonicalInputsString({
      z: [["1", "t"]],
      a: [["1", "t"]],
    } satisfies RowsByTable);
    const b = canonicalInputsString({
      a: [["1", "t"]],
      z: [["1", "t"]],
    } satisfies RowsByTable);
    expect(a).toBe(b);
  });
});
