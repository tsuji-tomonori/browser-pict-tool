type ExportableSuite = {
  header: string[];
  rows: string[][];
};

export function exportTsv(suite: ExportableSuite): string {
  return [suite.header, ...suite.rows].map((row) => row.join("\t")).join("\n");
}
