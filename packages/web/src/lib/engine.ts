import {
  exportCsv,
  exportMarkdown,
  exportTsv,
  generateTestSuite,
  parseModelText,
  validateModelDocument,
} from "../../../core/index.ts";
import type {
  ConstraintDefinition,
  Diagnostic as CoreDiagnostic,
  ModelDocument,
  ParameterDefinition,
} from "../../../core/index.ts";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  line?: number;
  column?: number;
  detail?: string;
}

export interface UiOptions {
  strength: number;
  caseSensitive: boolean;
  negativePrefix: string;
}

export interface GeneratedSuite {
  header: string[];
  rows: string[][];
  stats: {
    strength: number;
    parameterCount: number;
    constraintCount: number;
    generatedRowCount: number;
    generationTimeMs: number;
    uncoveredTupleCount: number;
    candidateRowCount: number;
    requiredTupleCount: number;
  };
  warnings: Diagnostic[];
}

export interface GenerateResult {
  suite: GeneratedSuite | null;
  diagnostics: Diagnostic[];
}

interface ParameterValue {
  id: string;
  raw: string;
  isNegative: boolean;
}

interface Parameter {
  key: string;
  id: string;
  displayName: string;
  values: ParameterValue[];
}

interface ParsedConstraint {
  line: number;
  column: number;
  raw: string;
  expression: unknown;
}

interface ParsedModel {
  parameters: Parameter[];
  constraints: ParsedConstraint[];
  options: UiOptions;
  parameterIndex: Map<string, Parameter>;
}

interface ParseResult {
  model: ParsedModel;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

export class CancelledError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

function normalizeModelText(modelText: string): string {
  return String(modelText ?? "").replace(/\r\n?/g, "\n");
}

function normalizeOptions(userOptions: Partial<UiOptions>): UiOptions {
  return {
    strength: Number(userOptions.strength ?? 2),
    caseSensitive: Boolean(userOptions.caseSensitive),
    negativePrefix: String(userOptions.negativePrefix ?? "~") || "~",
  };
}

function normalizeName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toLocaleLowerCase();
}

function mapDiagnostic(diagnostic: CoreDiagnostic): Diagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    line: diagnostic.start.line,
    column: diagnostic.start.column,
  };
}

function mapDiagnostics(diagnostics: readonly CoreDiagnostic[]): Diagnostic[] {
  return diagnostics.map(mapDiagnostic);
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function toLineColumn(source: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;

  for (let index = 0; index < safeOffset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
      continue;
    }

    column += 1;
  }

  return { line, column };
}

function mapParameter(parameter: ParameterDefinition, options: UiOptions): Parameter {
  const id = normalizeName(parameter.name, options.caseSensitive);

  return {
    key: parameter.name,
    id,
    displayName: parameter.name,
    values: parameter.values.map((value, valueIndex) => ({
      id: `${id}:${valueIndex}`,
      raw: value.primaryName,
      isNegative: value.isNegative,
    })),
  };
}

function mapConstraint(source: string, constraint: ConstraintDefinition): ParsedConstraint {
  const location = toLineColumn(source, constraint.span.start);

  return {
    line: location.line,
    column: location.column,
    raw: constraint.rawText,
    expression: constraint,
  };
}

function buildParsedModel(model: ModelDocument, options: UiOptions): ParsedModel {
  const parameters = model.parameters.map((parameter) => mapParameter(parameter, options));
  const parameterIndex = new Map<string, Parameter>();

  for (const parameter of parameters) {
    if (!parameterIndex.has(parameter.id)) {
      parameterIndex.set(parameter.id, parameter);
    }
  }

  return {
    parameters,
    constraints: model.constraints.map((constraint) => mapConstraint(model.source, constraint)),
    options,
    parameterIndex,
  };
}

function parseAndValidate(modelText: string, userOptions: Partial<UiOptions>) {
  const source = normalizeModelText(modelText);
  const options = normalizeOptions(userOptions);
  const parsed = parseModelText(source, {
    caseSensitive: options.caseSensitive,
    negativePrefix: options.negativePrefix,
  });
  const validation = validateModelDocument(parsed.model);

  return {
    options,
    parsed,
    validation,
    parseDiagnostics: mapDiagnostics(parsed.diagnostics),
    validationDiagnostics: mapDiagnostics(validation.diagnostics),
  };
}

export function parseModel(modelText: string, userOptions: Partial<UiOptions> = {}): ParseResult {
  const { options, parsed, parseDiagnostics, validationDiagnostics } = parseAndValidate(
    modelText,
    userOptions,
  );
  const diagnostics = [...parseDiagnostics, ...validationDiagnostics];

  return {
    model: buildParsedModel(parsed.model, options),
    diagnostics,
    hasErrors: hasErrorDiagnostics(diagnostics),
  };
}

export function generateSuite(
  modelText: string,
  userOptions: Partial<UiOptions> = {},
  reportProgress: (progress: number, stage: string) => void = () => undefined,
  cancellation: { cancelled?: boolean } = {},
): GenerateResult {
  reportProgress(4, "モデルを解析");

  const { options, parseDiagnostics, validation, validationDiagnostics } = parseAndValidate(
    modelText,
    userOptions,
  );
  const initialDiagnostics = [...parseDiagnostics, ...validationDiagnostics];

  reportProgress(24, "モデルを検証");

  if (hasErrorDiagnostics(initialDiagnostics)) {
    return {
      suite: null,
      diagnostics: initialDiagnostics,
    };
  }

  if (cancellation.cancelled) {
    throw new CancelledError();
  }

  reportProgress(48, "テストケースを生成");

  const generated = generateTestSuite(validation, {
    strength: options.strength,
  });
  const parseWarnings = parseDiagnostics.filter((diagnostic) => diagnostic.severity !== "error");
  const diagnostics = [...parseWarnings, ...mapDiagnostics(generated.diagnostics)];

  if (cancellation.cancelled) {
    throw new CancelledError();
  }

  reportProgress(100, "生成完了");

  return {
    suite: generated.suite
      ? {
          header: generated.suite.header,
          rows: generated.suite.rows,
          stats: generated.suite.stats,
          warnings: [...parseWarnings, ...mapDiagnostics(generated.suite.warnings)],
        }
      : null,
    diagnostics,
  };
}

export function formatSuite(suite: GeneratedSuite, format: "csv" | "tsv" | "md"): string {
  if (format === "csv") {
    return exportCsv(suite);
  }

  if (format === "tsv") {
    return exportTsv(suite);
  }

  return exportMarkdown(suite);
}
