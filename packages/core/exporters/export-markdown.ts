type ExportableSuite = {
  header: string[];
  rows: string[][];
};

function escapeMarkdownCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function exportMarkdown(suite: ExportableSuite): string {
  const headerRow = `| ${suite.header.map(escapeMarkdownCell).join(" | ")} |`;
  const dividerRow = `| ${suite.header.map(() => "---").join(" | ")} |`;
  const dataRows = suite.rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`);

  return [headerRow, dividerRow, ...dataRows].join("\n");
}
