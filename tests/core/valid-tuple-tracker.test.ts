import assert from "node:assert/strict";
import test from "node:test";

import {
  createValidTupleTracker,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

function prepareModel(source: string, strength = 2) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  return normalizeValidatedModel(validation, strength);
}

test("valid tuple tracker counts all tuples in an unconstrained pairwise model", () => {
  const model = prepareModel(`P0: 0, 1, 2
P1: 0, 1, 2
`);
  const tracker = createValidTupleTracker(model, () => true);

  assert.equal(tracker.requiredTupleCount, 9);
  assert.equal(tracker.coveredTupleCount(), 0);
  assert.equal(tracker.uncoveredTupleCount(), 9);
});

test("valid tuple tracker reports cover gain before adding a row", () => {
  const model = prepareModel(`P0: 0, 1
P1: 0, 1
P2: 0, 1
`);
  const tracker = createValidTupleTracker(model, () => true);

  assert.equal(tracker.coverGainIfRowAdded([0, 0, 0]), 3);

  tracker.markRowCovered([0, 0, 0]);

  assert.equal(tracker.coverGainIfRowAdded([0, 0, 0]), 0);
});

test("valid tuple tracker marks covered tuples from rows", () => {
  const model = prepareModel(`P0: 0, 1, 2
P1: 0, 1, 2
`);
  const tracker = createValidTupleTracker(model, () => true);

  tracker.markRowCovered([0, 0]);
  assert.equal(tracker.coveredTupleCount(), 1);
  assert.equal(tracker.uncoveredTupleCount(), 8);
  assert.equal(tracker.isTupleCovered([0, 0], [0, 1]), true);

  for (let p0 = 0; p0 < 3; p0 += 1) {
    for (let p1 = 0; p1 < 3; p1 += 1) {
      tracker.markRowCovered([p0, p1]);
    }
  }

  assert.equal(tracker.uncoveredTupleCount(), 0);
});

test("valid tuple tracker picks uncovered tuples until exhausted", () => {
  const model = prepareModel(`P0: 0, 1, 2
P1: 0, 1, 2
`);
  const tracker = createValidTupleTracker(model, () => true);

  assert.notEqual(tracker.pickUncoveredTuple(), null);

  for (let p0 = 0; p0 < 3; p0 += 1) {
    for (let p1 = 0; p1 < 3; p1 += 1) {
      tracker.markRowCovered([p0, p1]);
    }
  }

  assert.equal(tracker.pickUncoveredTuple(), null);
});

test("valid tuple tracker excludes tuples that cannot satisfy constraints", () => {
  const model = prepareModel(`P0: 0, 1, 2
P1: 0, 1, 2

IF [P0] = 0 THEN [P1] = 0;
`);
  const canComplete = (partial: Map<number, number>) => {
    const p0 = partial.get(0);
    const p1 = partial.get(1);
    if (p0 === 0 && p1 !== undefined) {
      return p1 === 0;
    }
    return true;
  };

  const tracker = createValidTupleTracker(model, canComplete);

  assert.equal(tracker.requiredTupleCount, 7);
});

test("valid tuple tracker depends only on injected canComplete", () => {
  const model = prepareModel(`P0: 0, 1
P1: 0, 1
`);
  const tracker = createValidTupleTracker(model, (partial) => partial.get(0) === partial.get(1));

  assert.equal(tracker.requiredTupleCount, 2);
  assert.deepEqual(tracker.pickUncoveredTuple(), {
    subset: [0, 1],
    values: [0, 0],
  });

  tracker.markRowCovered([0, 0]);
  assert.equal(tracker.uncoveredTupleCount(), 1);
});
