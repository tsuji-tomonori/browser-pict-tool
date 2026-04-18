import assert from "node:assert/strict";
import test from "node:test";

import {
  createConstraintSolver,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

function prepareModel(source: string, strength = 2) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  return normalizeValidatedModel(validation, strength);
}

function findParameterIndex(model: ReturnType<typeof prepareModel>, name: string): number {
  const parameterIndex = model.parameters.findIndex((parameter) => parameter.name === name);
  assert.notEqual(parameterIndex, -1, `parameter '${name}' not found`);
  return parameterIndex;
}

function findValueIndex(
  model: ReturnType<typeof prepareModel>,
  parameterIndex: number,
  displayText: string,
): number {
  const parameter = model.parameters[parameterIndex];
  assert.notEqual(parameter, undefined);
  const valueIndex = parameter.values.findIndex((value) => value.displayText === displayText);
  assert.notEqual(
    valueIndex,
    -1,
    `value '${displayText}' not found for parameter '${parameter.name}'`,
  );
  return valueIndex;
}

test("constraint solver completes unconstrained rows", () => {
  const model = prepareModel(`A: 0, 1, 2
B: x, y, z
`);
  const solver = createConstraintSolver(model);

  assert.equal(solver.canComplete(new Map()), true);

  const completed = solver.completeRow(new Map());
  assert.notEqual(completed, null);
  assert.equal(completed?.length, 2);
});

test("constraint solver rejects partials that violate constraints", () => {
  const model = prepareModel(`A: x, y
B: y, z

IF [A] = "x" THEN [B] = "y";
`);
  const solver = createConstraintSolver(model);
  const aIndex = findParameterIndex(model, "A");
  const bIndex = findParameterIndex(model, "B");

  const satisfiable = new Map<number, number>([[aIndex, findValueIndex(model, aIndex, "x")]]);
  const unsatisfiable = new Map<number, number>([
    [aIndex, findValueIndex(model, aIndex, "x")],
    [bIndex, findValueIndex(model, bIndex, "z")],
  ]);

  assert.equal(solver.canComplete(satisfiable), true);
  assert.equal(solver.canComplete(unsatisfiable), false);
});

test("constraint solver returns no feasible values from an already invalid partial", () => {
  const model = prepareModel(`A: x, y
B: y, z
C: p, q

IF [A] = "x" THEN [B] = "y";
`);
  const solver = createConstraintSolver(model);
  const aIndex = findParameterIndex(model, "A");
  const bIndex = findParameterIndex(model, "B");
  const cIndex = findParameterIndex(model, "C");

  const partial = new Map<number, number>([
    [aIndex, findValueIndex(model, aIndex, "x")],
    [bIndex, findValueIndex(model, bIndex, "z")],
  ]);

  assert.deepEqual(solver.feasibleValues(partial, cIndex), []);
});

test("constraint solver enforces at most one negative value per row", () => {
  const model = prepareModel(`P0: ~neg0, ok0
P1: ~neg1, ok1
`);
  const solver = createConstraintSolver(model);

  const partial = new Map<number, number>([
    [0, findValueIndex(model, 0, "~neg0")],
    [1, findValueIndex(model, 1, "~neg1")],
  ]);

  assert.equal(solver.canComplete(partial), false);
});

test("constraint solver memoizes repeated failed partials", () => {
  const model = prepareModel(`A: x, y
B: y, z

IF [A] = "x" THEN [B] = "y";
`);
  const solver = createConstraintSolver(model);
  const aIndex = findParameterIndex(model, "A");
  const bIndex = findParameterIndex(model, "B");
  const partial = new Map<number, number>([
    [aIndex, findValueIndex(model, aIndex, "x")],
    [bIndex, findValueIndex(model, bIndex, "z")],
  ]);

  const before = solver.stats();
  assert.equal(solver.canComplete(partial), false);
  const afterFirst = solver.stats();
  assert.equal(solver.canComplete(partial), false);
  const afterSecond = solver.stats();

  assert.equal(afterFirst.memoMisses > before.memoMisses, true);
  assert.equal(afterSecond.memoHits > afterFirst.memoHits, true);
});
