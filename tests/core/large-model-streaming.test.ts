import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  generateTestSuite,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

type LargeModelFixture = {
  model: string;
  strength: number;
};

const largeModelFixtureDir = path.resolve(process.cwd(), "tests/core/fixtures");

function loadLargeModelFixture(filename: string): LargeModelFixture {
  return JSON.parse(
    fs.readFileSync(path.join(largeModelFixtureDir, filename), "utf8"),
  ) as LargeModelFixture;
}

test("generateTestSuite processes docs/pict-compatibility-factors.pict without hitting obsolete guards", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "docs/pict-compatibility-factors.pict"),
    "utf8",
  );
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  assert.equal(
    validation.diagnostics.some((d) => d.severity === "error"),
    false,
    "fixture must validate cleanly",
  );

  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null, "large model must produce a suite via streaming");
  assert.ok((generated.suite?.rows.length ?? 0) > 0);
  assert.equal(
    generated.diagnostics.some((d) => d.code === "generator.request.candidate_space_too_large"),
    false,
  );
});

// wp-04 で有効化する。
test.skip("loads poc-30x10x3wise.json", () => {
  const fixture = loadLargeModelFixture("poc-30x10x3wise.json");
  const parsed = parseModelText(fixture.model);
  const validation = validateModelDocument(parsed.model);
  assert.equal(
    validation.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    false,
  );

  const generated = generateTestSuite(validation, { strength: fixture.strength });
  assert.notEqual(generated.suite, null);
});

// wp-04 で有効化する。
test.skip("loads poc-100x10x2wise.json", () => {
  const fixture = loadLargeModelFixture("poc-100x10x2wise.json");
  const parsed = parseModelText(fixture.model);
  const validation = validateModelDocument(parsed.model);
  assert.equal(
    validation.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    false,
  );

  const generated = generateTestSuite(validation, { strength: fixture.strength });
  assert.notEqual(generated.suite, null);
});

// wp-04 で有効化する。
test.skip("loads poc-10x5x3wise-constrained.json", () => {
  const fixture = loadLargeModelFixture("poc-10x5x3wise-constrained.json");
  const parsed = parseModelText(fixture.model);
  const validation = validateModelDocument(parsed.model);
  assert.equal(
    validation.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    false,
  );

  const generated = generateTestSuite(validation, { strength: fixture.strength });
  assert.notEqual(generated.suite, null);
});
