import assert from "node:assert/strict";
import test from "node:test";

import {
  CancelledError,
  CollectingSink,
  FileSink,
  analyzeCoverage,
  collectedHeader,
  collectedRows,
  createCsvStreamEncoder,
  generateSuiteStreaming,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

function prepareModel(source: string, strength = 2) {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  return normalizeValidatedModel(validation, strength);
}

test("generateSuiteStreaming covers all tuples for an unconstrained pairwise model", async () => {
  const model = prepareModel(`A: 0, 1, 2
B: x, y, z
`);
  const sink = new CollectingSink();

  const result = await generateSuiteStreaming(model, sink);
  const rows = collectedRows(sink);

  assert.deepEqual(collectedHeader(sink), ["A", "B"]);
  assert.ok(rows.length <= 9);
  assert.equal(result.stats.generatedRowCount, rows.length);
  assert.deepEqual(result.stats.coverage, analyzeCoverage(model, rows));
  assert.equal(result.stats.coverage.requiredTupleCount, 9);
  assert.equal(result.stats.coverage.uncoveredTupleCount, 0);
  assert.deepEqual(result.seedWarnings, []);
});

test("generateSuiteStreaming throws CancelledError when cancellation is requested", async () => {
  const model = prepareModel(`A: 0, 1
B: x, y
C: p, q
`);
  const sink = new CollectingSink();
  let shouldCancel = false;

  await assert.rejects(
    generateSuiteStreaming(model, sink, {
      hooks: {
        onProgress() {
          shouldCancel = true;
        },
        shouldCancel() {
          return shouldCancel;
        },
      },
    }),
    CancelledError,
  );
});

test("generateSuiteStreaming writes header then encoded rows through FileSink", async () => {
  const model = prepareModel(`A: 1, 2
B: x, y
`);
  const chunks: string[] = [];
  const sink = new FileSink(
    {
      write(chunk) {
        chunks.push(chunk);
      },
    },
    createCsvStreamEncoder(),
  );

  await generateSuiteStreaming(model, sink);

  assert.deepEqual(chunks, ["A,B\n", "1,x\n", "1,y\n", "2,x\n", "2,y\n", ""]);
});

test("generateSuiteStreaming emits seed rows first", async () => {
  const model = prepareModel(`A: 1, 2
B: x, y
C: p, q
`);
  const sink = new CollectingSink();

  const result = await generateSuiteStreaming(model, sink, {
    seedRows: [[1, 1, 1]],
  });

  assert.deepEqual(result.seedWarnings, []);
  assert.deepEqual(collectedRows(sink)[0], ["2", "y", "q"]);
  assert.equal(result.stats.coverage.uncoveredTupleCount, 0);
});

test("generateSuiteStreaming reports invalid seed rows as warnings", async () => {
  const model = prepareModel(`A: 1, 2
B: x, y

IF [A] = 1 THEN [B] = "x";
`);
  const sink = new CollectingSink();

  const result = await generateSuiteStreaming(model, sink, {
    seedRows: [[0, 1]],
  });

  assert.deepEqual(result.seedWarnings, [{ rowIndex: 0, reason: "constraint_violation" }]);
  assert.equal(
    collectedRows(sink).some((row) => row.join("\u0001") === ["1", "y"].join("\u0001")),
    false,
  );
  assert.equal(result.stats.coverage.uncoveredTupleCount, 0);
});

test("generateSuiteStreaming uses randomSeed to break ties deterministically", async () => {
  const model = prepareModel(`A: 1, 2
B: x, y
C: p, q
`);
  const firstSink = new CollectingSink();
  const secondSink = new CollectingSink();
  const thirdSink = new CollectingSink();

  const first = await generateSuiteStreaming(model, firstSink, { randomSeed: 42 });
  const second = await generateSuiteStreaming(model, secondSink, { randomSeed: 42 });
  const third = await generateSuiteStreaming(model, thirdSink, { randomSeed: 99 });

  assert.deepEqual(collectedRows(firstSink), collectedRows(secondSink));
  assert.notDeepEqual(collectedRows(firstSink), collectedRows(thirdSink));
  assert.equal(first.stats.coverage.uncoveredTupleCount, 0);
  assert.equal(second.stats.coverage.uncoveredTupleCount, 0);
  assert.equal(third.stats.coverage.uncoveredTupleCount, 0);
});
