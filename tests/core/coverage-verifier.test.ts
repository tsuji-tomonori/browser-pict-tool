import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyGeneratedSuite } from "../../packages/core/coverage/index.ts";
import { generateTestSuite } from "../../packages/core/generator/index.ts";
import { parseModelText, validateModelDocument } from "../../packages/core/index.ts";
import type { GeneratedSuite } from "../../packages/core/model/index.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function loadText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function prepareValidation(source: string, options?: { caseSensitive?: boolean }) {
  const parsed = parseModelText(source, options);
  return validateModelDocument(parsed.model);
}

function generateSuiteOrThrow(
  source: string,
  args: { strength: number; caseSensitive?: boolean },
): { validation: ReturnType<typeof prepareValidation>; suite: GeneratedSuite } {
  const validation = prepareValidation(source, { caseSensitive: args.caseSensitive });
  const generated = generateTestSuite(validation, { strength: args.strength });

  assert.notEqual(generated.suite, null);

  return {
    validation,
    suite: generated.suite as GeneratedSuite,
  };
}

test("verifyGeneratedSuite reports clean coverage for required_v0_1 upstream fixtures", () => {
  const cases = [
    {
      source: loadText("tests/fixtures/upstream/arg/arg-001/model.pict"),
      strength: 1,
    },
    {
      source: loadText("tests/fixtures/upstream/cons/cons-004/model.pict"),
      strength: 2,
    },
  ];

  for (const entry of cases) {
    const { validation, suite } = generateSuiteOrThrow(entry.source, {
      strength: entry.strength,
    });
    const report = verifyGeneratedSuite({
      validation,
      strength: entry.strength,
      suite,
    });

    assert.equal(report.constraintViolatingRows, 0);
    assert.equal(report.uncoveredTupleCount, 0);
    assert.equal(report.excludedInvalidTupleCount, report.invalidTupleTargetedCount);
    assert.ok(report.invalidTupleTargetedCount >= 0);
    assert.equal(report.rowsWithMultipleNegativeValues, 0);
  }
});

test("verifyGeneratedSuite finds no uncovered tuples in an unconstrained 3x3 pairwise model", () => {
  const { validation, suite } = generateSuiteOrThrow(
    `A: 0, 1, 2
B: 0, 1, 2
C: 0, 1, 2
`,
    { strength: 2 },
  );

  const report = verifyGeneratedSuite({
    validation,
    strength: 2,
    suite,
  });

  assert.equal(report.uncoveredTupleCount, 0);
  assert.deepEqual(report.submodelCoverage, [
    {
      relationId: 0,
      required: 27,
      covered: 27,
      missing: 0,
    },
  ]);
});

test("verifyGeneratedSuite excludes invalid tuples from constrained tuple targets", () => {
  const fixture = JSON.parse(loadText("tests/core/fixtures/poc-10x5x3wise-constrained.json")) as {
    model: string;
    strength: number;
  };
  const { validation, suite } = generateSuiteOrThrow(fixture.model, {
    strength: fixture.strength,
  });

  const report = verifyGeneratedSuite({
    validation,
    strength: fixture.strength,
    suite,
  });

  assert.ok(report.excludedInvalidTupleCount > 0);
  assert.equal(report.invalidTupleTargetedCount, report.excludedInvalidTupleCount);
  assert.equal(report.uncoveredTupleCount, 0);
});

test("verifyGeneratedSuite detects missing coverage when a generated row is removed", () => {
  const { validation, suite } = generateSuiteOrThrow(
    `A: 0, 1, 2
B: 0, 1, 2
C: 0, 1, 2
`,
    { strength: 2 },
  );

  const incompleteSuite: GeneratedSuite = {
    ...suite,
    rows: suite.rows.slice(1),
  };

  const report = verifyGeneratedSuite({
    validation,
    strength: 2,
    suite: incompleteSuite,
  });

  assert.ok(report.uncoveredTupleCount > 0);
});

test("verifyGeneratedSuite reports no rows with multiple negative values in generated upstream suites", () => {
  const { validation, suite } = generateSuiteOrThrow(
    loadText("tests/fixtures/upstream/arg/arg-142/model.pict"),
    {
      strength: 2,
      caseSensitive: true,
    },
  );

  const report = verifyGeneratedSuite({
    validation,
    strength: 2,
    suite,
  });

  assert.equal(report.rowsWithMultipleNegativeValues, 0);
});
