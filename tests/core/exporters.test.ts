import assert from "node:assert/strict";
import test from "node:test";

import {
  exportCsv,
  exportMarkdown,
  exportTsv,
  neutralizeSpreadsheetCellValue,
} from "../../packages/core/index.ts";

test("exportCsv includes the header row and joins rows with commas", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [
      ["Chrome", "Windows"],
      ["Safari", "macOS"],
    ],
  };

  assert.equal(exportCsv(suite), ["Browser,OS", "Chrome,Windows", "Safari,macOS"].join("\n"));
});

test("exportCsv escapes cells containing commas and double quotes", () => {
  const suite = {
    header: ["Name", "Notes"],
    rows: [["Widget, Inc.", 'He said "hello"']],
  };

  assert.equal(exportCsv(suite), ["Name,Notes", '"Widget, Inc.","He said ""hello"""'].join("\n"));
});

test("exportTsv includes the header row and joins rows with tabs", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [
      ["Chrome", "Windows"],
      ["Safari", "macOS"],
    ],
  };

  assert.equal(exportTsv(suite), ["Browser\tOS", "Chrome\tWindows", "Safari\tmacOS"].join("\n"));
});

test("exportMarkdown formats a GitHub-flavored markdown table", () => {
  const suite = {
    header: ["Browser", "OS"],
    rows: [["Chrome", "Windows"]],
  };

  assert.equal(
    exportMarkdown(suite),
    ["| Browser | OS |", "| --- | --- |", "| Chrome | Windows |"].join("\n"),
  );
});

test("exportMarkdown escapes pipe characters in cell values", () => {
  const suite = {
    header: ["Name", "Notes"],
    rows: [["A|B", "safe | value"]],
  };

  assert.equal(
    exportMarkdown(suite),
    ["| Name | Notes |", "| --- | --- |", "| A\\|B | safe \\| value |"].join("\n"),
  );
});

test("exportCsv handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(exportCsv(suite), "A,B");
});

test("exportCsv handles cells containing newlines", () => {
  const suite = {
    header: ["A", "B"],
    rows: [["line1\nline2", "ok"]],
  };

  assert.equal(exportCsv(suite), ["A,B", '"line1\nline2",ok'].join("\n"));
});

test("exportTsv handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(exportTsv(suite), "A\tB");
});

test("exportMarkdown handles empty table with headers only", () => {
  const suite = { header: ["A", "B"], rows: [] as string[][] };

  assert.equal(exportMarkdown(suite), ["| A | B |", "| --- | --- |"].join("\n"));
});

test("exportMarkdown converts newlines to br tags", () => {
  const suite = {
    header: ["A"],
    rows: [["line1\nline2"]],
  };

  assert.equal(exportMarkdown(suite), ["| A |", "| --- |", "| line1<br>line2 |"].join("\n"));
});

test("exportCsv handles single column", () => {
  const suite = {
    header: ["Only"],
    rows: [["val1"], ["val2"]],
  };

  assert.equal(exportCsv(suite), ["Only", "val1", "val2"].join("\n"));
});

test("neutralizeSpreadsheetCellValue prefixes spreadsheet formula trigger values", () => {
  assert.equal(neutralizeSpreadsheetCellValue("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(neutralizeSpreadsheetCellValue("+42"), "'+42");
  assert.equal(neutralizeSpreadsheetCellValue("-42"), "'-42");
  assert.equal(neutralizeSpreadsheetCellValue("@cmd"), "'@cmd");
});

test("neutralizeSpreadsheetCellValue leaves normal values unchanged", () => {
  assert.equal(neutralizeSpreadsheetCellValue("plain text"), "plain text");
  assert.equal(
    neutralizeSpreadsheetCellValue("  =not-a-formula-trigger"),
    "  =not-a-formula-trigger",
  );
  assert.equal(neutralizeSpreadsheetCellValue(""), "");
});

test("exportCsv neutralizes spreadsheet formula trigger values", () => {
  const suite = {
    header: ["A", "B", "C", "D", "E"],
    rows: [["=1+1", "+1", "-1", "@SUM(A1)", "safe"]],
  };

  assert.equal(exportCsv(suite), ["A,B,C,D,E", "'=1+1,'+1,'-1,'@SUM(A1),safe"].join("\n"));
});

test("exportTsv neutralizes spreadsheet formula trigger values", () => {
  const suite = {
    header: ["A", "B", "C", "D", "E"],
    rows: [["=1+1", "+1", "-1", "@SUM(A1)", "safe"]],
  };

  assert.equal(exportTsv(suite), ["A\tB\tC\tD\tE", "'=1+1\t'+1\t'-1\t'@SUM(A1)\tsafe"].join("\n"));
});

test("exportCsv preserves existing CSV escaping while neutralizing formula cells", () => {
  const suite = {
    header: ["Name", "Notes"],
    rows: [["=SUM(1,2)", 'He said "hello"']],
  };

  assert.equal(exportCsv(suite), ["Name,Notes", '"\'=SUM(1,2)","He said ""hello"""'].join("\n"));
});
