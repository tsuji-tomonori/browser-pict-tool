import test from "node:test";
import assert from "node:assert/strict";

import { validateModelDocument } from "../../packages/core/constraints/index.ts";
import { normalizeValidatedModel } from "../../packages/core/generator/index.ts";
import {
  CONSTRAINT_FALSE,
  CONSTRAINT_TRUE,
  evaluateConstraintDefinition,
  type ConstraintAssignment,
  createConstraintEvaluationContext,
} from "../../packages/core/generator/constraint-evaluator.ts";
import { parseModelText } from "../../packages/core/parser/index.ts";

function prepareModel(source: string) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const model = normalizeValidatedModel(validation, 2);
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
    assert.notEqual(
      value,
      undefined,
      `value '${displayText}' not found for parameter '${parameter.name}'`,
    );
    assignment.set(parameter.id, value);
  }

  return assignment;
}

test("constraint evaluator treats question mark as a single-character LIKE wildcard", () => {
  const { model, context } = prepareModel(`Browser: IE1, IE12, Edge
Mode: Legacy, Modern

IF [Mode] = "Legacy" THEN [Browser] LIKE "IE?";
`);

  const constraint = model.constraints[0];
  assert.notEqual(constraint, undefined);

  const singleCharacterMatch = assignByDisplayText(model, {
    Browser: "IE1",
    Mode: "Legacy",
  });
  assert.equal(
    evaluateConstraintDefinition(constraint, singleCharacterMatch, context),
    CONSTRAINT_TRUE,
  );

  const multiCharacterMiss = assignByDisplayText(model, {
    Browser: "IE12",
    Mode: "Legacy",
  });
  assert.equal(
    evaluateConstraintDefinition(constraint, multiCharacterMiss, context),
    CONSTRAINT_FALSE,
  );
});
