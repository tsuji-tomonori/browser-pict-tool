import type { Fill, Workbook as ExcelWorkbook } from "exceljs";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADER_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};
const DIFFERENCE_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2B3" },
};
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 48;

type ExcelJSImport = typeof import("exceljs");
type WorkbookConstructor = new () => ExcelWorkbook;
type ExcelJSImportWithDefault = ExcelJSImport & {
  default?: Partial<ExcelJSImport> & {
    Workbook?: WorkbookConstructor;
  };
};

let excelJsPromise: Promise<ExcelJSImportWithDefault> | null = null;

function estimateColumnWidth(value: string): number {
  return Math.max(
    MIN_COLUMN_WIDTH,
    Math.min(MAX_COLUMN_WIDTH, Array.from(value).length + 2),
  );
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resolveWorkbookConstructor(exceljsModule: ExcelJSImportWithDefault): WorkbookConstructor {
  const workbookConstructor = exceljsModule.Workbook ?? exceljsModule.default?.Workbook;
  if (!workbookConstructor) {
    throw new Error("ExcelJS Workbook constructor is unavailable.");
  }
  return workbookConstructor;
}

async function loadExcelJs(): Promise<ExcelJSImportWithDefault> {
  if (!excelJsPromise) {
    excelJsPromise = import("exceljs") as Promise<ExcelJSImportWithDefault>;
  }
  return excelJsPromise;
}

export async function exportToExcel(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  opts: { fileName: string },
): Promise<void> {
  const exceljsModule = await loadExcelJs();
  const Workbook = resolveWorkbookConstructor(exceljsModule);
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Results");
  const headerValues = [...header];
  const columnWidths = headerValues.map((value) => estimateColumnWidth(value));
  const diffStartColumnIndex = headerValues[0] === "#" ? 1 : 0;

  workbook.creator = "browser-pict-tool";
  workbook.created = new Date();
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = worksheet.addRow(headerValues);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  let previousRow: string[] | null = null;

  for (const row of rows) {
    const currentRow = [...row];
    const worksheetRow = worksheet.addRow(currentRow);

    for (let columnIndex = 0; columnIndex < headerValues.length; columnIndex += 1) {
      const currentValue = currentRow[columnIndex] ?? "";
      columnWidths[columnIndex] = Math.max(
        columnWidths[columnIndex] ?? MIN_COLUMN_WIDTH,
        estimateColumnWidth(currentValue),
      );

      if (
        previousRow &&
        columnIndex >= diffStartColumnIndex &&
        currentValue !== (previousRow[columnIndex] ?? "")
      ) {
        worksheetRow.getCell(columnIndex + 1).fill = DIFFERENCE_FILL;
      }
    }

    previousRow = currentRow;
  }

  worksheet.columns.forEach((column, index) => {
    column.width = columnWidths[index] ?? MIN_COLUMN_WIDTH;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME_TYPE });
  triggerBlobDownload(blob, opts.fileName);
}
