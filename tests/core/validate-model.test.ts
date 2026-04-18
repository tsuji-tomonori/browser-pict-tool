import test from "node:test";
import assert from "node:assert/strict";

import { validateModelDocument } from "../../packages/core/constraints/index.ts";
import { parseModelText } from "../../packages/core/parser/index.ts";

test("validateModelDocument rejects duplicate parameter names", () => {
  const source = `G,a,b,c
H,1,2,3
G,r,s,t
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.model.duplicate_parameter_name",
    ),
    true,
  );
});

test("validateModelDocument rejects parameters with only negative values", () => {
  const source = `A: ~1, ~2
B: 1, 2
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.model.parameter_all_negative",
    ),
    true,
  );
});

test("validateModelDocument rejects models without parameters", () => {
  const parsed = parseModelText("");
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some((diagnostic) => diagnostic.code === "validation.model.no_parameters"),
    true,
  );
});

test("validateModelDocument drops constraints with unknown parameters as warnings", () => {
  const source = `A: 1, 2, 3
B: 1, 2, 3

IF [A] = 1 THEN [Z] = 2;
[B] = 2;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(validation.effectiveConstraints.length, 1);
  assert.equal(validation.droppedConstraints.length, 1);
  assert.equal(
    validation.diagnostics.some((diagnostic) => diagnostic.severity === "warning"),
    true,
  );
});

test("validateModelDocument reports parameter and value type mismatches", () => {
  const source = `Size: 1, 2, 3
Mode: Basic, Advanced

IF [Size] > 1 THEN [Mode] = 1;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.constraint.value_type_mismatch",
    ),
    true,
  );
});

test("validateModelDocument reports parameter-to-parameter type mismatches", () => {
  const source = `Size: 1, 2, 3
Mode: Basic, Advanced

[Size] = [Mode];
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.constraint.parameter_type_mismatch",
    ),
    true,
  );
});

test("validateModelDocument reports value-set type mismatches", () => {
  const source = `Size: 1, 2, 3

[Size] IN {"Small", "Medium"};
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.constraint.valueset_type_mismatch",
    ),
    true,
  );
});

test("validateModelDocument rejects parameter self-comparison", () => {
  const source = `A: 1, 2, 3

[A] = [A];
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.constraint.parameter_self_compare",
    ),
    true,
  );
});

test("validateModelDocument rejects LIKE on numeric parameters", () => {
  const source = `A: 1, 2, 3

[A] LIKE "1*";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  assert.equal(
    validation.diagnostics.some(
      (diagnostic) => diagnostic.code === "validation.constraint.like_numeric_parameter",
    ),
    true,
  );
});
