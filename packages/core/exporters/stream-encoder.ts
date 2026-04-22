import { neutralizeSpreadsheetCellValue } from "./spreadsheet-neutralization.ts";

export interface StreamEncoder {
  encodeHeader(header: readonly string[]): string;
  encodeRow(row: readonly string[]): string;
  encodeFooter(): string;
}

function escapeCsvCell(cell: string): string {
  const neutralizedCell = neutralizeSpreadsheetCellValue(cell);

  if (/[",\r\n]/.test(neutralizedCell)) {
    return `"${neutralizedCell.replace(/"/g, '""')}"`;
  }

  return neutralizedCell;
}

function escapeMarkdownCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function createCsvStreamEncoder(): StreamEncoder {
  return {
    encodeHeader(header) {
      return `${header.map(escapeCsvCell).join(",")}\n`;
    },
    encodeRow(row) {
      return `${row.map(escapeCsvCell).join(",")}\n`;
    },
    encodeFooter() {
      return "";
    },
  };
}

export function createTsvStreamEncoder(): StreamEncoder {
  return {
    encodeHeader(header) {
      return `${header.map(neutralizeSpreadsheetCellValue).join("\t")}\n`;
    },
    encodeRow(row) {
      return `${row.map(neutralizeSpreadsheetCellValue).join("\t")}\n`;
    },
    encodeFooter() {
      return "";
    },
  };
}

export function createMarkdownStreamEncoder(): StreamEncoder {
  return {
    encodeHeader(header) {
      const headerRow = `| ${header.map(escapeMarkdownCell).join(" | ")} |`;
      const dividerRow = `| ${header.map(() => "---").join(" | ")} |`;

      return `${headerRow}\n${dividerRow}\n`;
    },
    encodeRow(row) {
      return `| ${row.map(escapeMarkdownCell).join(" | ")} |\n`;
    },
    encodeFooter() {
      return "";
    },
  };
}
