import assert from "node:assert/strict";
import test from "node:test";

import { normalizeValidatedModel } from "../../packages/core/generator/index.ts";
import { iterateTuples } from "../../packages/core/coverage/index.ts";
import { parseModelText, validateModelDocument } from "../../packages/core/index.ts";

function prepareModel(source: string, strength = 2) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  return normalizeValidatedModel(validation, strength);
}

test("iterateTuples returns a lazy iterable rather than a pre-built array", () => {
  const model = prepareModel(`A: 0, 1
B: 0, 1
C: 0, 1
`);

  const tuples = iterateTuples(model, 2);

  assert.equal(Array.isArray(tuples), false);
  assert.equal(typeof tuples[Symbol.iterator], "function");
});

test("iterateTuples counts every tuple in a small root relation", () => {
  const model = prepareModel(`A: 0, 1
B: 0, 1, 2
C: 0, 1, 2, 3
`);

  const tuples = [...iterateTuples(model, 2)];

  assert.equal(tuples.length, 26);
  assert.equal(
    tuples.every((tuple) => tuple.relationId === 0),
    true,
  );
});

test("iterateTuples includes submodels with distinct relation ids", () => {
  const model = prepareModel(`A: 0, 1
B: 0, 1, 2
C: 0, 1

{ A, B } @ 1
{ B, C }
`);

  const counts = new Map<number, number>();

  for (const tuple of iterateTuples(model, 2)) {
    counts.set(tuple.relationId, (counts.get(tuple.relationId) ?? 0) + 1);
  }

  assert.deepEqual(
    [...counts.entries()].sort((left, right) => left[0] - right[0]),
    [
      [0, 16],
      [1, 5],
      [2, 6],
    ],
  );
});

test("iterateTuples supports partial consumption and stop-after-n traversal", () => {
  const model = prepareModel(`P0: 0, 1, 2, 3
P1: 0, 1, 2, 3
P2: 0, 1, 2, 3
P3: 0, 1, 2, 3
P4: 0, 1, 2, 3
`);

  let consumed = 0;

  for (const tuple of iterateTuples(model, 3)) {
    consumed += 1;
    assert.equal(tuple.relationId, 0);

    if (consumed === 5) {
      break;
    }
  }

  assert.equal(consumed, 5);
});
