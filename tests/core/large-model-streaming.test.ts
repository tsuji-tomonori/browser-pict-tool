import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  generateTestSuite,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

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
