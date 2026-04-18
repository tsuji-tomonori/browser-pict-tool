import type {
  Diagnostic,
  DiagnosticSeverity,
  SourcePosition,
  SourceSpan,
} from "../diagnostics/types.ts";

export class SourceFile {
  readonly text: string;
  readonly lineStarts: number[];

  constructor(text: string) {
    this.text = text;
    this.lineStarts = [0];

    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "\n") {
        this.lineStarts.push(index + 1);
      }
    }
  }

  positionAt(offset: number): SourcePosition {
    const clamped = Math.max(0, Math.min(offset, this.text.length));

    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = this.lineStarts[mid];
      const nextStart = this.lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

      if (clamped < start) {
        high = mid - 1;
      } else if (clamped >= nextStart) {
        low = mid + 1;
      } else {
        return {
          offset: clamped,
          line: mid + 1,
          column: clamped - start + 1,
        };
      }
    }

    return {
      offset: clamped,
      line: 1,
      column: clamped + 1,
    };
  }

  createDiagnostic(
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    span: SourceSpan,
  ): Diagnostic {
    return {
      code,
      severity,
      message,
      span,
      start: this.positionAt(span.start),
      end: this.positionAt(span.end),
    };
  }
}
