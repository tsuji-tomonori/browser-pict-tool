import test from "node:test";
import assert from "node:assert/strict";

import { parseModelText } from "../../packages/core/parser/index.ts";
import { validateModelDocument } from "../../packages/core/constraints/index.ts";
import { normalizeValidatedModel } from "../../packages/core/generator/index.ts";
import {
  CONSTRAINT_FALSE,
  CONSTRAINT_TRUE,
  CONSTRAINT_UNKNOWN,
  assignmentAllowsConstraints,
  createConstraintEvaluationContext,
  evaluateConstraintDefinition,
  type ConstraintAssignment,
} from "../../packages/core/generator/constraint-evaluator.ts";

function prepareModel(source: string, strength = 2) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const model = normalizeValidatedModel(validation, strength);
  const context = createConstraintEvaluationContext(model);

  return { model, context };
}

function assignByDisplayText(
  model: ReturnType<typeof prepareModel>["model"],
  values: Record<string, string>,
): ConstraintAssignment {
  const assignment: ConstraintAssignment = new Map();

  for (const parameter of model.parameters) {
    const displayText = values[parameter.name];
    if (displayText === undefined) {
      continue;
    }

    const value = parameter.values.find((candidate) => candidate.displayText === displayText);
    assert.notEqual(value, undefined, `value '${displayText}' not found for parameter '${parameter.name}'`);
    assignment.set(parameter.id, value);
  }

  return assignment;
}

test("constraint evaluator keeps implication unknown until the consequent is decided", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: 1, 2

IF [A] = 1 THEN [B] = 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const assignment = assignByDisplayText(model, {
    A: "1",
  });

  assert.equal(evaluateConstraintDefinition(constraint, assignment, context), CONSTRAINT_UNKNOWN);
  assert.equal(assignmentAllowsConstraints(model.constraints, assignment, context), true);
});

test("constraint evaluator resolves implication to true when the antecedent is false", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: 1, 2

IF [A] = 1 THEN [B] = 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const assignment = assignByDisplayText(model, {
    A: "2",
  });

  assert.equal(evaluateConstraintDefinition(constraint, assignment, context), CONSTRAINT_TRUE);
  assert.equal(assignmentAllowsConstraints(model.constraints, assignment, context), true);
});

test("constraint evaluator returns false only when a constraint is definitely violated", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: 1, 2

IF [A] = 1 THEN [B] = 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const assignment = assignByDisplayText(model, {
    A: "1",
    B: "2",
  });

  assert.equal(evaluateConstraintDefinition(constraint, assignment, context), CONSTRAINT_FALSE);
  assert.equal(assignmentAllowsConstraints(model.constraints, assignment, context), false);
});

test("constraint evaluator applies ELSE branches with three-valued logic", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: 1, 2
C: 1, 2

IF [A] = 1 THEN [B] = 1 ELSE [C] = 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const partialElseAssignment = assignByDisplayText(model, {
    A: "2",
  });
  assert.equal(
    evaluateConstraintDefinition(constraint, partialElseAssignment, context),
    CONSTRAINT_UNKNOWN,
  );

  const satisfiedElseAssignment = assignByDisplayText(model, {
    A: "2",
    C: "1",
  });
  assert.equal(
    evaluateConstraintDefinition(constraint, satisfiedElseAssignment, context),
    CONSTRAINT_TRUE,
  );
});

test("constraint evaluator handles IsNegative and NOT LIKE predicates", () => {
  const { model, context } = prepareModel(`Browser: IE11, Chrome
Mode: Modern, ~Legacy

IF IsNegative(Mode) THEN [Browser] NOT LIKE "IE*";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const validAssignment = assignByDisplayText(model, {
    Browser: "Chrome",
    Mode: "~Legacy",
  });
  assert.equal(evaluateConstraintDefinition(constraint, validAssignment, context), CONSTRAINT_TRUE);

  const invalidAssignment = assignByDisplayText(model, {
    Browser: "IE11",
    Mode: "~Legacy",
  });
  assert.equal(
    evaluateConstraintDefinition(constraint, invalidAssignment, context),
    CONSTRAINT_FALSE,
  );
});

test("constraint evaluator handles >= operator on numeric values", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: x, y

IF [A] >= 2 THEN [B] = "x";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const satisfied = assignByDisplayText(model, { A: "2", B: "x" });
  assert.equal(evaluateConstraintDefinition(constraint, satisfied, context), CONSTRAINT_TRUE);

  const violated = assignByDisplayText(model, { A: "3", B: "y" });
  assert.equal(evaluateConstraintDefinition(constraint, violated, context), CONSTRAINT_FALSE);

  const antecedentFalse = assignByDisplayText(model, { A: "1", B: "y" });
  assert.equal(evaluateConstraintDefinition(constraint, antecedentFalse, context), CONSTRAINT_TRUE);
});

test("constraint evaluator handles <= operator", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: x, y

[A] <= 2;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const fail = assignByDisplayText(model, { A: "3" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});

test("constraint evaluator handles > operator", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: x, y

[A] > 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const fail = assignByDisplayText(model, { A: "1" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});

test("constraint evaluator handles < operator", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: x, y

[A] < 3;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const fail = assignByDisplayText(model, { A: "3" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});

test("constraint evaluator handles IN operator", () => {
  const { model, context } = prepareModel(`A: x, y, z
B: 1, 2

[A] IN {"x", "y"};
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "x" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const fail = assignByDisplayText(model, { A: "z" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});

test("constraint evaluator handles NOT IN operator", () => {
  const { model, context } = prepareModel(`A: x, y, z
B: 1, 2

[A] NOT IN {"x", "y"};
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "z" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const fail = assignByDisplayText(model, { A: "x" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});

test("constraint evaluator currently matches alias literals by any alias name", () => {
  const { model, context } = prepareModel(`SKU: Professional, Server | Datacenter
Mode: A, B

[SKU] = "Server";
[SKU] = "Datacenter";
`);

  const serverConstraint = model.constraints[0];
  const datacenterConstraint = model.constraints[1];
  assert.notEqual(serverConstraint, undefined);
  assert.notEqual(datacenterConstraint, undefined);

  const assignment = assignByDisplayText(model, {
    SKU: "Server",
    Mode: "A",
  });

  assert.equal(evaluateConstraintDefinition(serverConstraint, assignment, context), CONSTRAINT_TRUE);
  // PICT says only the first alias name should count, but the current evaluator checks
  // every entry in value.names, so the alias literal also matches.
  assert.equal(
    evaluateConstraintDefinition(datacenterConstraint, assignment, context),
    CONSTRAINT_TRUE,
  );
});

test("constraint evaluator handles nested NOT", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: x, y

IF NOT NOT ([A] = 1) THEN [B] = "x";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const satisfied = assignByDisplayText(model, { A: "1", B: "x" });
  assert.equal(evaluateConstraintDefinition(constraint, satisfied, context), CONSTRAINT_TRUE);

  const violated = assignByDisplayText(model, { A: "1", B: "y" });
  assert.equal(evaluateConstraintDefinition(constraint, violated, context), CONSTRAINT_FALSE);
});

test("constraint evaluator handles AND with multiple conditions", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: x, y
C: p, q

IF [A] = 1 AND [B] = "x" THEN [C] = "p";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const bothTrue = assignByDisplayText(model, { A: "1", B: "x", C: "p" });
  assert.equal(evaluateConstraintDefinition(constraint, bothTrue, context), CONSTRAINT_TRUE);

  const bothTrueViolated = assignByDisplayText(model, { A: "1", B: "x", C: "q" });
  assert.equal(evaluateConstraintDefinition(constraint, bothTrueViolated, context), CONSTRAINT_FALSE);

  const firstFalse = assignByDisplayText(model, { A: "2", B: "x", C: "q" });
  assert.equal(evaluateConstraintDefinition(constraint, firstFalse, context), CONSTRAINT_TRUE);
});

test("constraint evaluator handles OR logic", () => {
  const { model, context } = prepareModel(`A: 1, 2
B: x, y

[A] = 1 OR [B] = "x";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const leftTrue = assignByDisplayText(model, { A: "1", B: "y" });
  assert.equal(evaluateConstraintDefinition(constraint, leftTrue, context), CONSTRAINT_TRUE);

  const rightTrue = assignByDisplayText(model, { A: "2", B: "x" });
  assert.equal(evaluateConstraintDefinition(constraint, rightTrue, context), CONSTRAINT_TRUE);

  const bothFalse = assignByDisplayText(model, { A: "2", B: "y" });
  assert.equal(evaluateConstraintDefinition(constraint, bothFalse, context), CONSTRAINT_FALSE);
});

test("constraint evaluator honors deeply nested parentheses in conditionals", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: x, y, z
C: p, q

IF ( [A] = 1 OR [A] = 2 ) AND ( [B] = "x" OR [B] = "y" ) THEN [C] = "p";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const satisfied = assignByDisplayText(model, { A: "1", B: "x", C: "p" });
  assert.equal(evaluateConstraintDefinition(constraint, satisfied, context), CONSTRAINT_TRUE);

  const violated = assignByDisplayText(model, { A: "2", B: "y", C: "q" });
  assert.equal(evaluateConstraintDefinition(constraint, violated, context), CONSTRAINT_FALSE);

  const groupedConditionFalse = assignByDisplayText(model, { A: "1", B: "z", C: "q" });
  assert.equal(
    evaluateConstraintDefinition(constraint, groupedConditionFalse, context),
    CONSTRAINT_TRUE,
  );
});

test("constraint evaluator handles IsPositive predicate", () => {
  const { model, context } = prepareModel(`A: x, ~y
B: 1, 2

IF IsPositive(A) THEN [B] = 1;
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const positive = assignByDisplayText(model, { A: "x", B: "1" });
  assert.equal(evaluateConstraintDefinition(constraint, positive, context), CONSTRAINT_TRUE);

  const negativeSkip = assignByDisplayText(model, { A: "~y", B: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, negativeSkip, context), CONSTRAINT_TRUE);
});

test("constraint evaluator handles parameter-to-parameter comparison", () => {
  const { model, context } = prepareModel(`A: 1, 2, 3
B: 1, 2, 3

[A] < [B];
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const pass = assignByDisplayText(model, { A: "1", B: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, pass, context), CONSTRAINT_TRUE);

  const equal = assignByDisplayText(model, { A: "2", B: "2" });
  assert.equal(evaluateConstraintDefinition(constraint, equal, context), CONSTRAINT_FALSE);

  const fail = assignByDisplayText(model, { A: "3", B: "1" });
  assert.equal(evaluateConstraintDefinition(constraint, fail, context), CONSTRAINT_FALSE);
});
