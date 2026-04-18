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
