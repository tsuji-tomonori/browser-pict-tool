import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectingSink,
  CompositeSink,
  FileSink,
  PreviewSink,
  collectedHeader,
  collectedRows,
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  previewIsTruncated,
  previewRows,
} from "../../packages/core/index.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test("CollectingSink stores the header and rows in memory", () => {
  const sink = new CollectingSink();

  sink.writeHeader(["Browser", "OS"]);
  sink.writeRow(["Chrome", "Windows"]);
  sink.writeRow(["Safari", "macOS"]);
  sink.close();

  assert.deepEqual(collectedHeader(sink), ["Browser", "OS"]);
  assert.deepEqual(collectedRows(sink), [
    ["Chrome", "Windows"],
    ["Safari", "macOS"],
  ]);
});

test("PreviewSink keeps only the first rows within its limit and reports truncation", () => {
  const sink = new PreviewSink(3);

  sink.writeHeader(["Case"]);
  sink.writeRow(["1"]);
  sink.writeRow(["2"]);
  sink.writeRow(["3"]);
  sink.writeRow(["4"]);
  sink.writeRow(["5"]);
  sink.close();

  assert.deepEqual(previewRows(sink), [["1"], ["2"], ["3"]]);
  assert.equal(previewIsTruncated(sink), true);
});

test("FileSink writes CSV chunks in encoder order and closes the writer", async () => {
  const chunks: string[] = [];
  let closed = false;
  const sink = new FileSink(
    {
      async write(chunk) {
        await delay(1);
        chunks.push(chunk);
      },
      async close() {
        await delay(1);
        closed = true;
      },
    },
    createCsvStreamEncoder(),
  );

  await sink.writeHeader(["Browser", "OS"]);
  await sink.writeRow(["Chrome", "Windows"]);
  await sink.close();

  assert.deepEqual(chunks, ["Browser,OS\n", "Chrome,Windows\n", ""]);
  assert.equal(closed, true);
});

test("FileSink writes Markdown chunks in encoder order and closes the writer", async () => {
  const chunks: string[] = [];
  let closed = false;
  const sink = new FileSink(
    {
      async write(chunk) {
        await delay(1);
        chunks.push(chunk);
      },
      async close() {
        await delay(1);
        closed = true;
      },
    },
    createMarkdownStreamEncoder(),
  );

  await sink.writeHeader(["Browser", "OS"]);
  await sink.writeRow(["Chrome", "Windows"]);
  await sink.close();

  assert.deepEqual(chunks, ["| Browser | OS |\n| --- | --- |\n", "| Chrome | Windows |\n", ""]);
  assert.equal(closed, true);
});

test("CompositeSink fans out the same header and rows to each child sink", async () => {
  const left = new CollectingSink();
  const right = new CollectingSink();
  const sink = new CompositeSink([left, right]);

  await sink.writeHeader(["Browser", "OS"]);
  await sink.writeRow(["Chrome", "Windows"]);
  await sink.writeRow(["Safari", "macOS"]);
  await sink.close();

  assert.deepEqual(collectedHeader(left), ["Browser", "OS"]);
  assert.deepEqual(collectedRows(left), [
    ["Chrome", "Windows"],
    ["Safari", "macOS"],
  ]);
  assert.deepEqual(collectedHeader(right), ["Browser", "OS"]);
  assert.deepEqual(collectedRows(right), [
    ["Chrome", "Windows"],
    ["Safari", "macOS"],
  ]);
});
