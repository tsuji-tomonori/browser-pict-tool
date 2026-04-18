import assert from "node:assert/strict";
import test from "node:test";

import {
  PreviewNotifySink,
  createChunkingSink,
  createCsvStreamEncoder,
} from "../../packages/web/src/lib/engine.ts";

function flushMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

test("createChunkingSink waits for STREAM_ACK before emitting the next chunk", async () => {
  const chunks: Array<{ chunkId: number; chunk: string }> = [];
  const sink = createChunkingSink({
    encoder: createCsvStreamEncoder(),
    chunkRowLimit: 1,
    onChunk(chunkId, chunk) {
      chunks.push({ chunkId, chunk });
    },
  });

  await sink.writeHeader(["Case"]);

  let firstResolved = false;
  const firstWrite = sink.writeRow(["1"]).then(() => {
    firstResolved = true;
  });

  await flushMicrotask();
  assert.deepEqual(chunks, [{ chunkId: 1, chunk: "Case\n1\n" }]);
  assert.equal(firstResolved, false);

  const secondWrite = sink.writeRow(["2"]);

  await flushMicrotask();
  assert.equal(chunks.length, 1);

  sink.acknowledge(1);
  await firstWrite;
  await flushMicrotask();

  assert.equal(firstResolved, true);
  assert.deepEqual(chunks, [
    { chunkId: 1, chunk: "Case\n1\n" },
    { chunkId: 2, chunk: "2\n" },
  ]);

  sink.acknowledge(2);
  await secondWrite;
  await sink.close();
});

test("PreviewNotifySink invokes its callback once when the preview limit is reached", () => {
  const notifications: Array<{
    rows: readonly (readonly string[])[];
    truncated: boolean;
  }> = [];
  const sink = new PreviewNotifySink(2, (rows, truncated) => {
    notifications.push({
      rows: rows.map((row) => [...row]),
      truncated,
    });
  });

  sink.writeHeader(["Case"]);
  sink.writeRow(["1"]);
  assert.equal(notifications.length, 0);

  sink.writeRow(["2"]);
  assert.deepEqual(notifications, [
    {
      rows: [["1"], ["2"]],
      truncated: false,
    },
  ]);

  sink.writeRow(["3"]);
  sink.close();

  assert.equal(notifications.length, 1);
});
