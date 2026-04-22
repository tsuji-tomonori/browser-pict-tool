const FORMULA_TRIGGER_PREFIXES = ["=", "+", "-", "@"];

export function neutralizeSpreadsheetCellValue(cell: string): string {
  if (cell.length === 0) {
    return cell;
  }

  return FORMULA_TRIGGER_PREFIXES.includes(cell[0]) ? `'${cell}` : cell;
}
