import assert from "node:assert/strict";
import test from "node:test";

import {
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  createTsvStreamEncoder,
} from "../../packages/core/index.ts";

type ExportableSuite = {
  header: string[];
  rows: string[][];
};

function encodeSuite(
  encoder: {
    encodeHeader(header: readonly string[]): string;
    encodeRow(row: readonly string[]): string;
    encodeFooter(): string;
  },
  suite: ExportableSuite,
): string {
  return (
    encoder.encodeHeader(suite.header) +
    suite.rows.map((row) => encoder.encodeRow(row)).join("") +
    encoder.encodeFooter()
  );
}

test("createCsvStreamEncoder includes the header row and joins rows with commas", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [
      ["Chrome", "Windows"],
      ["Safari", "macOS"],
    ],
  };

  assert.equal(
    encodeSuite(createCsvStreamEncoder(), suite),
    ["Browser,OS", "Chrome,Windows", "Safari,macOS", ""].join("\n"),
  );
});

test("createCsvStreamEncoder escapes cells containing commas and double quotes", () => {
  const suite = {
    header: ["Name", "Notes"],
    rows: [["Widget, Inc.", 'He said "hello"']],
  };

  assert.equal(
    encodeSuite(createCsvStreamEncoder(), suite),
    ["Name,Notes", '"Widget, Inc.","He said ""hello"""', ""].join("\n"),
  );
});

test("createTsvStreamEncoder includes the header row and joins rows with tabs", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [
      ["Chrome", "Windows"],
      ["Safari", "macOS"],
    ],
  };

  assert.equal(
    encodeSuite(createTsvStreamEncoder(), suite),
    ["Browser\tOS", "Chrome\tWindows", "Safari\tmacOS", ""].join("\n"),
  );
});

test("createMarkdownStreamEncoder formats a GitHub-flavored markdown table", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [["Chrome", "Windows"]],
  };

  assert.equal(
    encodeSuite(createMarkdownStreamEncoder(), suite),
    ["| Browser | OS |", "| --- | --- |", "| Chrome | Windows |", ""].join("\n"),
  );
});

test("createMarkdownStreamEncoder escapes pipe characters in cell values", () => {
  const suite = {
    header: ["Name", "Notes"],
    rows: [["A|B", "safe | value"]],
  };

  assert.equal(
    encodeSuite(createMarkdownStreamEncoder(), suite),
    ["| Name | Notes |", "| --- | --- |", "| A\\|B | safe \\| value |", ""].join("\n"),
  );
});

test("createCsvStreamEncoder handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(encodeSuite(createCsvStreamEncoder(), suite), "A,B\n");
});

test("createCsvStreamEncoder handles cells containing newlines", () => {
  const suite = {
    header: ["A", "B"],
    rows: [["line1\nline2", "ok"]],
  };

  assert.equal(
    encodeSuite(createCsvStreamEncoder(), suite),
    ["A,B", '"line1\nline2",ok', ""].join("\n"),
  );
});

test("createTsvStreamEncoder handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(encodeSuite(createTsvStreamEncoder(), suite), "A\tB\n");
});

test("createMarkdownStreamEncoder handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(
    encodeSuite(createMarkdownStreamEncoder(), suite),
    ["| A | B |", "| --- | --- |", ""].join("\n"),
  );
});

test("createMarkdownStreamEncoder converts newlines to br tags", () => {
  const suite = {
    header: ["A"],
    rows: [["line1\nline2"]],
  };

  assert.equal(
    encodeSuite(createMarkdownStreamEncoder(), suite),
    ["| A |", "| --- |", "| line1<br>line2 |", ""].join("\n"),
  );
});

test("createCsvStreamEncoder handles single column", () => {
  const suite = {
    header: ["Only"],
    rows: [["val1"], ["val2"]],
  };

  assert.equal(
    encodeSuite(createCsvStreamEncoder(), suite),
    ["Only", "val1", "val2", ""].join("\n"),
  );
});
