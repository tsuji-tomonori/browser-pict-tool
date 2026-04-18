export interface StreamEncoder {
  encodeHeader(header: readonly string[]): string;
  encodeRow(row: readonly string[]): string;
  encodeFooter(): string;
}

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
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
      return `${header.join("\t")}\n`;
    },
    encodeRow(row) {
      return `${row.join("\t")}\n`;
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
