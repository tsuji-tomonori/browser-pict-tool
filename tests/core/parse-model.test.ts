import test from "node:test";
import assert from "node:assert/strict";

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
