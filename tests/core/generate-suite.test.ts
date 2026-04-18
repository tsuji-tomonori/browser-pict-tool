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

test("generateTestSuite currently treats partial seed rows as unmatched", () => {
  const source = `A: 1, 2, 3
B: x, y, z
C: p, q, r
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, {
    strength: 2,
    seedRows: [["1", "", "r"]],
  });

  assert.notEqual(generated.suite, null);
  // PICT allows partial seed rows, but the current generator only matches complete candidate rows.
  assert.equal(
    generated.diagnostics.some((diagnostic) => diagnostic.code === "generator.seed.unmatched_row"),
    true,
  );
});

test("generateTestSuite skips seed rows that violate constraints", () => {
  const source = `A: 1, 2
B: x, y

IF [A] = 1 THEN [B] = "x";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, {
    strength: 2,
    seedRows: [["1", "y"]],
  });

  assert.notEqual(generated.suite, null);
  // Current behavior filters invalid seed rows out as unmatched after candidate enumeration.
  assert.equal(
    generated.diagnostics.some((diagnostic) => diagnostic.code === "generator.seed.unmatched_row"),
    true,
  );
  assert.equal(
    generated.suite?.rows.some((row) => row.join("\u0001") === ["1", "y"].join("\u0001")),
    false,
  );
});

test("generateTestSuite enforces at most one negative value per row in more complex models", () => {
  const source = `A: ~-1, 0, 1, 2
B: ~-1, 0, 1, 2
C: x, ~y
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

test("generateTestSuite supports the dummy value technique with constraints", () => {
  const source = `P1: -1, 0, 1
P2: A, B, C, NA
P3: X, Y, Z, NA

IF [P1] = -1 THEN [P2] = "NA" AND [P3] = "NA" ELSE [P2] <> "NA" AND [P3] <> "NA";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(generated.suite?.coverage.uncoveredTupleCount, 0);
  assert.equal(
    generated.suite?.rows.some((row) => row[0] === "-1"),
    true,
  );

  for (const row of generated.suite?.rows ?? []) {
    if (row[0] === "-1") {
      assert.equal(row[1], "NA");
      assert.equal(row[2], "NA");
      continue;
    }

    assert.notEqual(row[1], "NA");
    assert.notEqual(row[2], "NA");
  }
});

test("generateTestSuite reports unsatisfiable models", () => {
  const source = `A: 1, 2
B: 1, 2

[A] = 1;
[A] = 2;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

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

test("generateTestSuite handles single-parameter model with strength 1", () => {
  const source = `A: 1, 2, 3
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 1 });

  assert.notEqual(generated.suite, null);
  assert.equal(generated.suite?.rows.length, 3);
});

test("generateTestSuite rejects strength exceeding parameter count", () => {
  const source = `A: 1, 2
B: x, y
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 3 });

  assert.equal(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.request.strength_too_large",
    ),
    true,
  );
});

test("generateTestSuite handles strength=max keyword", () => {
  const source = `A: 1, 2
B: x, y
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: "max" });

  assert.notEqual(generated.suite, null);
  // strength=max means all-way coverage = exhaustive
  assert.equal(generated.suite?.rows.length, 4);
});

test("generateTestSuite handles single-value parameters", () => {
  const source = `A: 1
B: x
C: p, q
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  for (const row of generated.suite?.rows ?? []) {
    assert.equal(row[0], "1");
    assert.equal(row[1], "x");
  }
});

test("generateTestSuite warns about sub-models but still generates", () => {
  const source = `A: 1, 2, 3
B: x, y
C: p, q

{ A, B } @ 2
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.feature.submodel_ignored",
    ),
    true,
  );
});

test("generateTestSuite warns about weight annotations", () => {
  const source = `A: 1 (5), 2 (3), 3
B: x, y
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.feature.weight_ignored",
    ),
    true,
  );
});

test("generateTestSuite produces correct header names", () => {
  const source = `Browser: Chrome, Firefox
Operating System: Windows, macOS
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.deepEqual(generated.suite?.header, ["Browser", "Operating System"]);
});

test("generateTestSuite streams through very large candidate spaces without hitting the old enumeration guard", () => {
  const source = Array.from({ length: 9 }, (_, index) => {
    const values = Array.from({ length: 6 }, (_unused, valueIndex) => `v${valueIndex + 1}`).join(
      ", ",
    );
    return `P${index + 1}: ${values}`;
  }).join("\n");

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.request.candidate_space_too_large",
    ),
    false,
    "candidate_space_too_large must not fire post stream refactor",
  );
  assert.equal(generated.suite?.coverage.uncoveredTupleCount, 0);
});

test("generateTestSuite rejects models whose tuple upper bound exceeds the safety budget", () => {
  const source = Array.from({ length: 2100 }, (_, index) => `P${index + 1}: only`).join("\n");

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.equal(generated.suite, null);
  assert.equal(
    generated.diagnostics.some(
      (diagnostic) => diagnostic.code === "generator.request.coverage_space_too_large",
    ),
    true,
  );
});
