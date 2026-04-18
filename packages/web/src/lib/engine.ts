import {
  createConstraintSolver,
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  createTsvStreamEncoder,
  generateSuiteStreaming,
  exportCsv,
  exportMarkdown,
  exportTsv,
  CollectingSink,
  CompositeSink,
  FileSink,
  generateTestSuite,
  normalizeValidatedModel,
  parseModelText,
  PreviewSink,
  validateModelDocument,
} from "../../../core/index.ts";
import type {
  ConstraintDefinition,
  Diagnostic as CoreDiagnostic,
  ModelDocument,
  ParameterDefinition,
  RowSink,
  StreamEncoder,
  ValidationResult,
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
  stats: GeneratedSuiteStats;
  warnings: Diagnostic[];
}

export interface GenerateResult {
  suite: GeneratedSuite | null;
  diagnostics: Diagnostic[];
}

export interface GeneratedSuiteStats {
  strength: number;
  parameterCount: number;
  constraintCount: number;
  generatedRowCount: number;
  generationTimeMs: number;
  uncoveredTupleCount: number;
  candidateRowCount: number;
  requiredTupleCount: number;
  bruteForceCaseCount: string;
  reducedCaseCount: string;
  reductionRate: string;
}

export type EngineStreamRequest = {
  modelText: string;
  options: Partial<UiOptions>;
  sink: RowSink;
  cancellation?: { cancelled?: boolean };
  onProgress?: (progress: number, stage: string) => void;
};

export interface AckControlledChunkSink extends RowSink {
  acknowledge(chunkId: number): boolean;
  cancelPending(error?: unknown): void;
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

const MAX_REQUIRED_TUPLE_UPPER_BOUND = 2_000_000n;

export class CancelledError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

type ChunkEmitter = (chunkId: number, chunk: string) => Promise<void> | void;

type ChunkingSinkOptions = {
  encoder: StreamEncoder;
  chunkRowLimit?: number;
  onChunk: ChunkEmitter;
};

export class PreviewNotifySink implements RowSink {
  readonly limit: number;
  readonly onPreview: (rows: readonly string[][], truncated: boolean) => void;

  #rows: string[][] = [];
  #truncated = false;
  #notified = false;

  constructor(limit: number, onPreview: (rows: readonly string[][], truncated: boolean) => void) {
    this.limit = Math.max(0, limit);
    this.onPreview = onPreview;
  }

  writeHeader(_header: readonly string[]): void {
    if (this.limit === 0) {
      this.#notify();
    }
  }

  writeRow(row: readonly string[]): void {
    if (this.#rows.length < this.limit) {
      this.#rows.push([...row]);
    } else {
      this.#truncated = true;
    }

    if (this.#rows.length === this.limit) {
      this.#notify();
    }
  }

  close(): void {
    this.#notify();
  }

  #notify(): void {
    if (this.#notified) {
      return;
    }

    this.#notified = true;
    this.onPreview(
      this.#rows.map((row) => [...row]),
      this.#truncated,
    );
  }
}

class ChunkingSink implements AckControlledChunkSink {
  readonly encoder: StreamEncoder;
  readonly chunkRowLimit: number;
  readonly onChunk: ChunkEmitter;

  #buffer = "";
  #bufferedRowCount = 0;
  #nextChunkId = 1;
  #pendingAck: {
    chunkId: number;
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null = null;
  #closed = false;
  #terminalError: unknown = null;
  #operationChain = Promise.resolve();

  constructor(options: ChunkingSinkOptions) {
    this.encoder = options.encoder;
    this.chunkRowLimit = Math.max(1, Math.trunc(options.chunkRowLimit ?? 512));
    this.onChunk = options.onChunk;
  }

  writeHeader(header: readonly string[]): Promise<void> {
    return this.#enqueue(async () => {
      this.#buffer += this.encoder.encodeHeader(header);
    });
  }

  writeRow(row: readonly string[]): Promise<void> {
    return this.#enqueue(async () => {
      this.#buffer += this.encoder.encodeRow(row);
      this.#bufferedRowCount += 1;
      if (this.#bufferedRowCount >= this.chunkRowLimit) {
        await this.#flush();
      }
    });
  }

  close(): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#closed) {
        return;
      }

      this.#closed = true;
      this.#buffer += this.encoder.encodeFooter();
      await this.#flush(true);
    });
  }

  acknowledge(chunkId: number): boolean {
    if (!this.#pendingAck || this.#pendingAck.chunkId !== chunkId) {
      return false;
    }

    const pendingAck = this.#pendingAck;
    this.#pendingAck = null;
    pendingAck.resolve();
    return true;
  }

  cancelPending(error: unknown = new CancelledError()): void {
    this.#terminalError = error;

    if (!this.#pendingAck) {
      return;
    }

    const pendingAck = this.#pendingAck;
    this.#pendingAck = null;
    pendingAck.reject(error);
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.#terminalError) {
        throw this.#terminalError;
      }

      await operation();
    };
    const next = this.#operationChain.then(run, run);

    this.#operationChain = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  }

  async #flush(force = false): Promise<void> {
    if (this.#terminalError) {
      throw this.#terminalError;
    }

    if (!force && this.#bufferedRowCount < this.chunkRowLimit) {
      return;
    }

    if (this.#buffer.length === 0) {
      return;
    }

    const chunkId = this.#nextChunkId;
    this.#nextChunkId += 1;

    const chunk = this.#buffer;
    this.#buffer = "";
    this.#bufferedRowCount = 0;

    await this.onChunk(chunkId, chunk);
    await new Promise<void>((resolve, reject) => {
      this.#pendingAck = { chunkId, resolve, reject };
    });
  }
}

export function createChunkingSink(options: ChunkingSinkOptions): AckControlledChunkSink {
  return new ChunkingSink(options);
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

function createGlobalDiagnostic(
  severity: DiagnosticSeverity,
  code: string,
  message: string,
): Diagnostic {
  return {
    severity,
    code,
    message,
  };
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

function createOffsetDiagnostic(
  source: string,
  offset: number,
  severity: DiagnosticSeverity,
  code: string,
  message: string,
): Diagnostic {
  const location = toLineColumn(source, offset);

  return {
    severity,
    code,
    message,
    line: location.line,
    column: location.column,
  };
}

function addCapped(left: bigint, right: bigint, limit: bigint): bigint {
  const next = left + right;
  return next > limit ? limit + 1n : next;
}

function multiplyCapped(left: bigint, right: bigint, limit: bigint): bigint {
  if (left === 0n || right === 0n) {
    return 0n;
  }

  const next = left * right;
  return next > limit ? limit + 1n : next;
}

function estimateRequiredTupleUpperBound(
  valueCounts: bigint[],
  choose: number,
  limit: bigint,
): bigint {
  if (choose <= 0) {
    return 0n;
  }

  if (choose === 1) {
    return valueCounts.reduce((sum, count) => addCapped(sum, count, limit), 0n);
  }

  if (choose > valueCounts.length) {
    return 0n;
  }

  let total = 0n;

  const walk = (start: number, remaining: number, product: bigint): void => {
    if (total > limit) {
      return;
    }

    if (remaining === 0) {
      total = addCapped(total, product, limit);
      return;
    }

    for (let index = start; index <= valueCounts.length - remaining; index += 1) {
      walk(index + 1, remaining - 1, multiplyCapped(product, valueCounts[index] ?? 0n, limit));
      if (total > limit) {
        return;
      }
    }
  };

  walk(0, choose, 1n);
  return total;
}

function calculateCartesianProduct(valueCounts: readonly bigint[]): bigint {
  if (valueCounts.length === 0) {
    return 0n;
  }

  return valueCounts.reduce((product, count) => product * count, 1n);
}

function formatPercentage(
  numerator: bigint,
  denominator: bigint,
  fractionDigits = 14,
): string {
  if (denominator <= 0n) {
    return "-";
  }

  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (numerator * 100n * scale + denominator / 2n) / denominator;
  const integerPart = scaled / scale;
  const fractionalPart = scaled % scale;
  const fractionalText = fractionalPart
    .toString()
    .padStart(fractionDigits, "0")
    .replace(/0+$/, "");

  return fractionalText.length > 0
    ? `${integerPart.toString()}.${fractionalText}%`
    : `${integerPart.toString()}%`;
}

function buildCartesianMetrics(
  validation: ValidationResult,
  generatedRowCount: number,
): Pick<GeneratedSuiteStats, "bruteForceCaseCount" | "reducedCaseCount" | "reductionRate"> {
  const bruteForceCaseCount = calculateCartesianProduct(
    validation.parameters.map((parameter) => BigInt(parameter.values.length)),
  );
  const generatedRows = BigInt(Math.max(0, Math.trunc(generatedRowCount)));
  const reducedCaseCount =
    bruteForceCaseCount > generatedRows ? bruteForceCaseCount - generatedRows : 0n;

  return {
    bruteForceCaseCount: bruteForceCaseCount.toString(),
    reducedCaseCount: reducedCaseCount.toString(),
    reductionRate: formatPercentage(reducedCaseCount, bruteForceCaseCount),
  };
}

function buildSuiteStats(
  validation: ValidationResult,
  stats: Omit<
    GeneratedSuiteStats,
    "bruteForceCaseCount" | "reducedCaseCount" | "reductionRate"
  >,
): GeneratedSuiteStats {
  return {
    ...stats,
    ...buildCartesianMetrics(validation, stats.generatedRowCount),
  };
}

function resolveStrength(
  validation: ValidationResult,
  options: UiOptions,
): { strength: number | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const strength = Number(options.strength ?? 2);

  if (!Number.isInteger(strength) || strength < 1) {
    diagnostics.push(
      createGlobalDiagnostic(
        "error",
        "generator.request.invalid_strength",
        "strength は 1 以上の整数か 'max' を指定してください",
      ),
    );
    return {
      strength: null,
      diagnostics,
    };
  }

  if (validation.parameters.length > 0 && strength > validation.parameters.length) {
    diagnostics.push(
      createGlobalDiagnostic(
        "error",
        "generator.request.strength_too_large",
        `strength=${strength} は parameter 数 ${validation.parameters.length} を超えています`,
      ),
    );
    return {
      strength: null,
      diagnostics,
    };
  }

  return {
    strength,
    diagnostics,
  };
}

function collectFeatureDiagnostics(validation: ValidationResult): {
  warnings: Diagnostic[];
  errors: Diagnostic[];
} {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  for (const submodel of validation.submodels) {
    warnings.push(
      createOffsetDiagnostic(
        validation.source,
        submodel.span.start,
        "warning",
        "generator.feature.submodel_ignored",
        "sub-model は初版ではまだ反映されません (無視して全体で生成します)",
      ),
    );
  }

  let weightWarningAdded = false;
  for (const parameter of validation.parameters) {
    for (const value of parameter.values) {
      if (value.source === "reference") {
        errors.push(
          createOffsetDiagnostic(
            validation.source,
            value.span.start,
            "error",
            "generator.feature.reference_value_unsupported",
            "reference value は generator core の初版ではまだ未対応です",
          ),
        );
      }

      if (!weightWarningAdded && value.explicitWeight) {
        warnings.push(
          createOffsetDiagnostic(
            validation.source,
            value.span.start,
            "warning",
            "generator.feature.weight_ignored",
            "weight 指定は generator core の初版ではまだ反映されません",
          ),
        );
        weightWarningAdded = true;
      }
    }
  }

  return { warnings, errors };
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
          stats: buildSuiteStats(validation, generated.suite.stats),
          warnings: [...parseWarnings, ...mapDiagnostics(generated.suite.warnings)],
        }
      : null,
    diagnostics,
  };
}

export async function generateSuiteToSink(request: EngineStreamRequest): Promise<{
  stats: GeneratedSuite["stats"] | null;
  header: readonly string[] | null;
  diagnostics: Diagnostic[];
}> {
  const startedAt = Date.now();
  const reportProgress = request.onProgress ?? (() => undefined);
  const cancellation = request.cancellation ?? {};

  reportProgress(4, "モデルを解析");

  const { options, parseDiagnostics, validation, validationDiagnostics } = parseAndValidate(
    request.modelText,
    request.options,
  );
  const initialDiagnostics = [...parseDiagnostics, ...validationDiagnostics];

  reportProgress(24, "モデルを検証");

  if (hasErrorDiagnostics(initialDiagnostics)) {
    return {
      stats: null,
      header: null,
      diagnostics: initialDiagnostics,
    };
  }

  const diagnostics = [...initialDiagnostics];
  const { strength, diagnostics: strengthDiagnostics } = resolveStrength(validation, options);
  if (strength === null) {
    return {
      stats: null,
      header: null,
      diagnostics: [...diagnostics, ...strengthDiagnostics],
    };
  }

  const featureDiagnostics = collectFeatureDiagnostics(validation);
  diagnostics.push(...featureDiagnostics.warnings);
  if (featureDiagnostics.errors.length > 0) {
    return {
      stats: null,
      header: null,
      diagnostics: [...diagnostics, ...featureDiagnostics.errors],
    };
  }

  if (cancellation.cancelled) {
    throw new CancelledError();
  }

  const canonicalModel = normalizeValidatedModel(validation, strength);
  const requiredTupleUpperBound = estimateRequiredTupleUpperBound(
    canonicalModel.parameters.map((parameter) => BigInt(parameter.values.length)),
    canonicalModel.options.strength,
    MAX_REQUIRED_TUPLE_UPPER_BOUND,
  );
  if (requiredTupleUpperBound > MAX_REQUIRED_TUPLE_UPPER_BOUND) {
    return {
      stats: null,
      header: null,
      diagnostics: [
        ...diagnostics,
        createGlobalDiagnostic(
          "error",
          "generator.request.coverage_space_too_large",
          `必要組の上限見積り ${requiredTupleUpperBound.toString()} が安全上限 ${MAX_REQUIRED_TUPLE_UPPER_BOUND.toString()} を超えるため生成を中断しました。parameter を分割するか strength を下げてください`,
        ),
      ],
    };
  }

  if (!createConstraintSolver(canonicalModel).canComplete(new Map<number, number>())) {
    return {
      stats: null,
      header: null,
      diagnostics: [
        ...diagnostics,
        createGlobalDiagnostic(
          "error",
          "generator.model.unsatisfiable",
          "制約を満たす組み合わせが存在しません",
        ),
      ],
    };
  }

  reportProgress(48, "テストケースを生成");

  try {
    const result = await generateSuiteStreaming(canonicalModel, request.sink, {
      hooks: {
        onProgress(covered, required) {
          const ratio = required <= 0 ? 1 : covered / required;
          reportProgress(Math.min(96, 48 + Math.round(ratio * 48)), "テストケースを生成");
        },
        shouldCancel() {
          return Boolean(cancellation.cancelled);
        },
      },
    });

    if (result.stats.coverage.uncoveredTupleCount > 0) {
      diagnostics.push(
        createGlobalDiagnostic(
          "warning",
          "generator.coverage.partial",
          "一部の tuple を覆いきれませんでした",
        ),
      );
    }

    reportProgress(100, "生成完了");

    return {
      stats: buildSuiteStats(validation, {
        strength: canonicalModel.options.strength,
        parameterCount: canonicalModel.parameters.length,
        constraintCount: canonicalModel.constraints.length,
        generatedRowCount: result.stats.generatedRowCount,
        generationTimeMs: Date.now() - startedAt,
        uncoveredTupleCount: result.stats.coverage.uncoveredTupleCount,
        candidateRowCount: result.stats.generatedRowCount,
        requiredTupleCount: result.stats.coverage.requiredTupleCount,
      }),
      header: canonicalModel.parameters.map((parameter) => parameter.displayName),
      diagnostics,
    };
  } catch (error) {
    if (error instanceof CancelledError || error instanceof Error) {
      if (error.name === "CancelledError") {
        throw new CancelledError();
      }
    }

    throw error;
  }
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

export {
  CollectingSink,
  CompositeSink,
  FileSink,
  PreviewSink,
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  createTsvStreamEncoder,
  generateSuiteStreaming,
};

export type { RowSink, StreamEncoder };
