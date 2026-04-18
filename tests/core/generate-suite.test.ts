import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCoverage,
  generateTestSuite,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

test("generateTestSuite is deterministic and reaches pairwise coverage for valid tuples", () => {
  const source = `Browser: Chrome, Firefox, Safari
OS: Windows, macOS
Locale: en, ja

IF [Browser] = "Safari" THEN [OS] = "macOS";
IF [Browser] = "Chrome" THEN [Locale] <> "ja";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const first = generateTestSuite(validation, { strength: 2 });
  const second = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(first.suite, null);
  assert.notEqual(second.suite, null);
  assert.deepEqual(first.suite?.rows, second.suite?.rows);
  assert.equal(first.suite?.coverage.uncoveredTupleCount, 0);

  const canonicalModel = normalizeValidatedModel(validation, 2);
  const coverage = analyzeCoverage(canonicalModel, first.suite?.rows ?? []);

  assert.deepEqual(coverage, first.suite?.coverage);
});

test("generateTestSuite does not place multiple negative values in the same row", () => {
  const source = `API: REST, GraphQL
Auth: None, ~Expired
Region: US, ~EU
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  for (const row of generated.suite?.rows ?? []) {
    const negativeCount = row.filter((value) => value.startsWith("~")).length;
    assert.ok(negativeCount <= 1, `expected at most one negative value per row: ${row.join(", ")}`);
  }
});

test("generateTestSuite reports unsatisfiable models", () => {
  const source = `A: 1, 2

[A] = 1;
[A] = 2;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 1 });

  assert.equal(generated.suite, null);
  assert.equal(
    generated.diagnostics.some((diagnostic) => diagnostic.code === "generator.model.unsatisfiable"),
    true,
  );
});

test("generateTestSuite fails fast for unsupported reference values", () => {
  const source = `A: 1, 2
B: <A>
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.equal(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.feature.reference_value_unsupported",
    ),
    true,
  );
});
