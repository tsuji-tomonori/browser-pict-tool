import test from "node:test";
import assert from "node:assert/strict";

import { validateModelDocument } from "../../packages/core/constraints/index.ts";
import { parseModelText } from "../../packages/core/parser/index.ts";

test("parseModelText parses basic parameter and constraint sections", () => {
  const source = `Browser: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
Login: Email, SSO

IF [Browser] = "Safari" THEN [OS] <> "Linux";
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters.length, 3);
  assert.equal(result.model.constraints.length, 1);
  assert.equal(result.model.parameters[0]?.name, "Browser");
  assert.equal(result.model.parameters[0]?.values[0]?.primaryName, "Chrome");
  assert.equal(result.model.constraints[0]?.kind, "conditional");

  const constraint = result.model.constraints[0];
  assert.equal(constraint?.kind, "conditional");
  if (constraint?.kind === "conditional") {
    assert.equal(constraint.condition.kind, "comparison");
    assert.equal(constraint.consequent.kind, "comparison");
  }
});

test("parseModelText supports permissive parameter lines and empty names", () => {
  const source = `,a,b,c
gr  oup,1,2,3

if [] = "a" then [gr  oup] > 1;
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.name, "");
  assert.equal(result.model.parameters[1]?.name, "gr  oup");
  assert.equal(result.model.parameters[0]?.values[0]?.primaryName, "a");

  const constraint = result.model.constraints[0];
  assert.equal(constraint?.kind, "conditional");
  if (constraint?.kind === "conditional" && constraint.condition.kind === "comparison") {
    assert.equal(constraint.condition.left.name, "");
  }
});

test("parseModelText parses submodels and extended operators", () => {
  const source = `A: 1, 2, 3
B: one, two
C: alpha, beta

{ A, B } @ 2

IF [B] NOT LIKE "t*" THEN [A] NOT IN {2, 3};
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.submodels.length, 1);
  assert.deepEqual(result.model.submodels[0]?.parameterNames, ["A", "B"]);

  const constraint = result.model.constraints[0];
  assert.equal(constraint?.kind, "conditional");
  if (constraint?.kind === "conditional" && constraint.condition.kind === "comparison") {
    assert.equal(constraint.condition.operator, "NOT LIKE");
  }
  if (constraint?.kind === "conditional" && constraint.consequent.kind === "comparison") {
    assert.equal(constraint.consequent.operator, "NOT IN");
    assert.equal(constraint.consequent.right.kind, "value_set");
  }
});

test("parseModelText reports a constraint syntax error with location", () => {
  const source = `A: 1, 2, 3
B: 1, 2, 3

IF [A] = 1 THEN [B] = 2
`;

  const result = parseModelText(source);

  assert.equal(result.model.constraints.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "parser.constraint.missing_semicolon");
  assert.equal(result.diagnostics[0]?.start.line, 5);
});

test("parseModelText handles empty input", () => {
  const result = parseModelText("");

  assert.equal(result.model.parameters.length, 0);
  assert.equal(result.model.constraints.length, 0);
});

test("parseModelText handles whitespace-only input", () => {
  const result = parseModelText("   \n\n  \n");

  assert.equal(result.model.parameters.length, 0);
  assert.equal(result.model.constraints.length, 0);
});

test("parseModelText handles unicode parameter names and values", () => {
  const source = `ブラウザ: Chrome, Firefox, Safari
OS: Windows, macOS
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.name, "ブラウザ");
  assert.equal(result.model.parameters[0]?.values.length, 3);
});

test("parseModelText ignores comment lines starting with #", () => {
  const source = `# This is a comment
Type: Primary, Logical
# Another comment
Size: 10, 100
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters.length, 2);
  assert.equal(result.model.parameters[0]?.name, "Type");
  assert.deepEqual(
    result.model.parameters[0]?.values.map((value) => value.primaryName),
    ["Primary", "Logical"],
  );
  assert.equal(result.model.parameters[1]?.name, "Size");
  assert.deepEqual(
    result.model.parameters[1]?.values.map((value) => value.primaryName),
    ["10", "100"],
  );
});

test("parseModelText supports custom value delimiters", () => {
  const source = `Type| Primary| Logical
Size| 10| 100
`;

  const result = parseModelText(source, { valueDelimiter: "|" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters.length, 2);
  assert.equal(result.model.parameters[0]?.name, "Type");
  assert.deepEqual(
    result.model.parameters[0]?.values.map((value) => value.primaryName),
    ["Primary", "Logical"],
  );
  assert.equal(result.model.parameters[1]?.name, "Size");
  assert.deepEqual(
    result.model.parameters[1]?.values.map((value) => value.primaryName),
    ["10", "100"],
  );
});

test("parseModelText handles aliases with pipe separator", () => {
  const source = `Browser: Chrome | Cr, Firefox | FF
OS: Windows, macOS
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.values[0]?.primaryName, "Chrome");
  assert.ok(result.model.parameters[0]?.values[0]?.aliases?.length > 0);
});

test("parseModelText parses aliases into primary names and aliases", () => {
  const source = `OS: Win7 | Windows7, Win10 | Windows10
Mode: Fast, Slow
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.model.parameters[0]?.values[0]?.names, ["Win7", "Windows7"]);
  assert.deepEqual(result.model.parameters[0]?.values[0]?.aliases, ["Windows7"]);
  assert.deepEqual(result.model.parameters[0]?.values[1]?.names, ["Win10", "Windows10"]);
  assert.deepEqual(result.model.parameters[0]?.values[1]?.aliases, ["Windows10"]);
});

test("parseModelText handles negative values with default prefix", () => {
  const source = `A: 1, ~2, 3
B: x, y
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.values[1]?.isNegative, true);
  assert.equal(result.model.parameters[0]?.values[0]?.isNegative, false);
});

test("parseModelText handles custom negative prefix", () => {
  const source = `A: 1, !2, 3
B: x, y
`;

  const result = parseModelText(source, { negativePrefix: "!" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.values[1]?.isNegative, true);
});

test("parseModelText strips the negative prefix before numeric type detection", () => {
  const source = `A: ~-1, 0, 1, 2
B: ~-1, 0, 1, 2
`;

  const result = parseModelText(source);
  const validation = validateModelDocument(result.model);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(validation.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.values[0]?.primaryName, "-1");
  assert.equal(result.model.parameters[0]?.values[0]?.isNegative, true);
  assert.equal(validation.parameters[0]?.dataType, "number");
  assert.equal(validation.parameters[1]?.dataType, "number");
});

test("parseModelText handles weighted values", () => {
  const source = `A: 1 (5), 2 (3), 3
B: x, y
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters[0]?.values.length, 3);
});

test("parseModelText handles single parameter with single value", () => {
  const source = `A: 1
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters.length, 1);
  assert.equal(result.model.parameters[0]?.values.length, 1);
});

test("parseModelText handles many parameters", () => {
  const lines = [];
  for (let i = 0; i < 20; i++) {
    lines.push(`P${i}: a${i}, b${i}, c${i}`);
  }

  const result = parseModelText(lines.join("\n"));

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.parameters.length, 20);
});

test("parseModelText handles multiple constraints", () => {
  const source = `A: 1, 2, 3
B: x, y, z
C: p, q

IF [A] = 1 THEN [B] = "x";
IF [B] = "y" THEN [C] = "p";
[A] <> 3;
`;

  const result = parseModelText(source);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.model.constraints.length, 3);
  assert.equal(result.model.constraints[2]?.kind, "invariant");
});
