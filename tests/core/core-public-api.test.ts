import test from "node:test";
import assert from "node:assert/strict";

import {
  generateTestSuite,
  hasErrorDiagnostics,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

test("core root entrypoint exposes parser, validator, generator, and diagnostics helpers", () => {
  const source = `Browser: Chrome, Firefox
OS: Windows, macOS

IF [Browser] = "Chrome" THEN [OS] <> "macOS";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.equal(parsed.model.parameters.length, 2);
  assert.equal(validation.effectiveConstraints.length, 1);
  assert.notEqual(generated.suite, null);
  assert.equal(generated.suite?.coverage.uncoveredTupleCount, 0);
  assert.equal(hasErrorDiagnostics([...parsed.diagnostics, ...validation.diagnostics]), false);
});
