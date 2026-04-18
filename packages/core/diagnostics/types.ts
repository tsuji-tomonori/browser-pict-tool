export type SourceSpan = {
  start: number;
  end: number;
};

export type SourcePosition = {
  offset: number;
  line: number;
  column: number;
};

export type DiagnosticSeverity = "error" | "warning";

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  span: SourceSpan;
  start: SourcePosition;
  end: SourcePosition;
};

export function hasErrorDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
