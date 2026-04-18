import test from "node:test";
import assert from "node:assert/strict";

import {
  generateTestSuite,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

test("seeding forces specified rows into output", () => {
  const source = `A: 1, 2, 3
B: x, y, z
C: p, q, r`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, {
    strength: 2,
    seedRows: [["1", "y", "r"]],
  });

  assert.notEqual(generated.suite, null);
  assert.equal(
    generated.suite?.rows.some((row) => row.join("\u0001") === ["1", "y", "r"].join("\u0001")),
    true,
  );
});

test("random seed produces deterministic but different outputs", () => {
  const source = `A: 1, 2, 3
B: x, y, z`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const first = generateTestSuite(validation, { strength: 2, randomSeed: 42 });
  const second = generateTestSuite(validation, { strength: 2, randomSeed: 42 });
  const third = generateTestSuite(validation, { strength: 2, randomSeed: 99 });

  assert.notEqual(first.suite, null);
  assert.notEqual(second.suite, null);
  assert.notEqual(third.suite, null);
  assert.deepEqual(first.suite?.rows, second.suite?.rows);
  assert.notDeepEqual(first.suite?.rows, third.suite?.rows);
  assert.equal(first.suite?.coverage.uncoveredTupleCount, 0);
  assert.equal(second.suite?.coverage.uncoveredTupleCount, 0);
  assert.equal(third.suite?.coverage.uncoveredTupleCount, 0);
});

test("unmatched seed row produces warning", () => {
  const source = `A: 1, 2, 3
B: x, y, z`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, {
    strength: 2,
    seedRows: [["9", "missing"]],
  });

  assert.notEqual(generated.suite, null);
  assert.equal(
    generated.diagnostics.some((diagnostic) => diagnostic.code === "generator.seed.unmatched_row"),
    true,
  );
});
