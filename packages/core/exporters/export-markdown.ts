import { createMarkdownStreamEncoder } from "./stream-encoder.ts";

type ExportableSuite = {
  header: string[];
  rows: string[][];
};

export function exportMarkdown(suite: ExportableSuite): string {
  const encoder = createMarkdownStreamEncoder();
  const output =
    encoder.encodeHeader(suite.header) +
    suite.rows.map((row) => encoder.encodeRow(row)).join("") +
    encoder.encodeFooter();

  return output.endsWith("\n") ? output.slice(0, -1) : output;
}
