type ExportableSuite = {
  header: string[];
  rows: string[][];
};

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

export function exportCsv(suite: ExportableSuite): string {
  return [suite.header, ...suite.rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}
