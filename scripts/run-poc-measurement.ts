import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  CancelledError,
  generateSuiteStreaming,
  hasErrorDiagnostics,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
  type Diagnostic,
  type GeneratedSuite,
  type RowSink,
  type ValidationResult,
} from "../packages/core/index.ts";
import { verifyGeneratedSuite, type VerifierReport } from "../packages/core/coverage/index.ts";
import {
  createStreamingGenerationPlanner,
  type StreamingGenerationPlanner,
} from "../packages/core/generator/streaming-generator.ts";

type FixturePayload = {
  model: string;
  strength: number;
};

type FixtureSpec = {
  filename: string;
  timeoutMs?: number;
};

type CoverageMode = "eager" | "lazy";
type ChildMode = "cancel" | "measure";
type ConstraintMode = "none" | "light";
type ScriptMode = "fixture-only" | "full" | "sweep-only";

type OriginalFixtureMeasurementResult = {
  fixture: string;
  parameterCount: number;
  strength: number;
  elapsedMs: number;
  heapPeakBytes: number;
  generatedRowCount: number;
  uncoveredTupleCount: number;
  constraintViolatingRows: number;
  invalidTupleTargetedCount: number;
  cancelMs: number | string;
  timeoutReason?: string;
  error?: string;
};

type ChildMeasureResult = Omit<OriginalFixtureMeasurementResult, "cancelMs">;

type ChildCancelResult = {
  cancelMs: number | string;
};

type LegacyMeasurementRoot = {
  measuredAt: string;
  measurementDate: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  commitHash: string;
  results: OriginalFixtureMeasurementResult[];
};

type PreparedFixture = {
  payload: FixturePayload;
  validation: ValidationResult;
  diagnostics: Diagnostic[];
  parameterCount: number;
};

type ChildPhaseResult<T> =
  | {
      kind: "success";
      value: T;
    }
  | {
      kind: "timeout";
      timeoutMs: number;
      stderr: string;
    }
  | {
      kind: "error";
      message: string;
      stderr: string;
    };

type CoverageSnapshot = {
  strength: number;
  requiredTupleCount: number;
  coveredTupleCount: number;
  uncoveredTupleCount: number;
};

type PhaseSeparatedMeasurement = {
  ctorMs: number;
  firstRowMs: number;
  remainingRowsMs: number;
  verifierMs: number | null;
  fullRunMs: number;
  elapsedMs: number;
  generatedRowCount: number;
  requiredTupleCount: number;
  coveredTupleCount: number;
  uncoveredTupleCount: number;
  constraintViolatingRows: number | null;
  invalidTupleTargetedCount: number | null;
  rowsWithMultipleNegativeValues: number | null;
  heapBaselineBytes: number;
  heapPeakBytes: number;
  heapDeltaBytes: number;
  timeoutReason: string | null;
  error?: string;
};

type SweepCaseSpec = {
  n: number;
  v: number;
  t: number;
  constraints: ConstraintMode;
};

type SweepMeasurement = PhaseSeparatedMeasurement & {
  coverage: CoverageMode;
  n: number;
  v: number;
  t: number;
  constraints: ConstraintMode;
  skippedBecauseLarger?: boolean;
};

type ConstrainedFixtureMeasurement = PhaseSeparatedMeasurement & {
  coverage: CoverageMode;
  fixture: string;
};

type CancelMeasurement = {
  case: {
    n: number;
    v: number;
    t: number;
    coverage: CoverageMode;
    constraints: ConstraintMode;
  };
  targetMs: number;
  actualMs: number | string;
};

type DetailedMeasurementRoot = {
  measuredAt: string;
  measurementDate: string;
  measurementCommand: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  osLabel: string;
  commitHash: string;
  originalFixtures: OriginalFixtureMeasurementResult[];
  sweep: SweepMeasurement[];
  constrainedFixture: {
    fixture: string;
    eager: ConstrainedFixtureMeasurement | null;
    lazy: ConstrainedFixtureMeasurement | null;
  };
  cancel: CancelMeasurement | null;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureDir = path.resolve(repoRoot, "tests/core/fixtures");
const outputDir = path.resolve(repoRoot, ".work");
const legacyOutputPath = path.resolve(outputDir, "poc-measurement.json");
const detailedOutputPath = path.resolve(outputDir, "poc-measurement-detailed.json");
const scriptPath = fileURLToPath(import.meta.url);
const rowYieldInterval = 128;
const cancellationTargetMs = 250;
const detailedCancelTargetMs = 200;
const defaultCancellationBudgetMs = 5_000;
const sweepCaseTimeoutMs = 30_000;
const constrainedFixtureTimeoutMs = 60_000;
const constrainedFixtureName = "poc-10x5x3wise-constrained.json";
const sweepCaseSpecs: SweepCaseSpec[] = [
  { n: 5, v: 5, t: 2, constraints: "none" },
  { n: 10, v: 5, t: 2, constraints: "none" },
  { n: 15, v: 5, t: 2, constraints: "none" },
  { n: 20, v: 5, t: 2, constraints: "none" },
  { n: 10, v: 10, t: 2, constraints: "none" },
  { n: 15, v: 10, t: 2, constraints: "none" },
  { n: 20, v: 10, t: 2, constraints: "none" },
  { n: 5, v: 5, t: 3, constraints: "none" },
  { n: 8, v: 5, t: 3, constraints: "none" },
  { n: 10, v: 5, t: 3, constraints: "none" },
];

function readOptionalTimeout(name: string): number | undefined {
  const value = process.env[name];

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const cancellationBudgetMs =
  readOptionalTimeout("POC_CANCEL_BUDGET_MS") ?? defaultCancellationBudgetMs;
const fixtureSpecs: FixtureSpec[] = [
  {
    filename: "poc-30x10x3wise.json",
    timeoutMs: readOptionalTimeout("POC_TIMEOUT_30_MS") ?? 900_000,
  },
  {
    filename: "poc-100x10x2wise.json",
    timeoutMs: readOptionalTimeout("POC_TIMEOUT_100_MS"),
  },
];

class MeasuringSink implements RowSink {
  header: string[] = [];
  rows: string[][] = [];
  rowCount = 0;
  readonly retainRows: boolean;

  constructor(retainRows: boolean) {
    this.retainRows = retainRows;
  }

  async writeHeader(header: readonly string[]): Promise<void> {
    this.header = [...header];
    await waitForImmediate();
  }

  async writeRow(row: readonly string[]): Promise<void> {
    this.rowCount += 1;

    if (this.retainRows) {
      this.rows.push([...row]);
    }

    if (this.rowCount % rowYieldInterval === 0) {
      await waitForImmediate();
    }
  }

  async close(): Promise<void> {
    await waitForImmediate();
  }
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readCommitHash(): string {
  try {
    const headPath = path.resolve(repoRoot, ".git/HEAD");
    const head = readFileSync(headPath, "utf8").trim();

    if (head.startsWith("ref: ")) {
      const refPath = path.resolve(repoRoot, ".git", head.slice(5));
      return readFileSync(refPath, "utf8").trim();
    }

    if (head.length > 0) {
      return head;
    }
  } catch {
    // Fall back to invoking git below.
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function formatMeasurementDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function describeDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .slice(0, 5)
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("; ");
}

function loadFixture(filename: string): FixturePayload {
  return JSON.parse(readFileSync(path.resolve(fixtureDir, filename), "utf8")) as FixturePayload;
}

function prepareFixture(filename: string): PreparedFixture {
  const payload = loadFixture(filename);
  const parsed = parseModelText(payload.model);
  const validation = validateModelDocument(parsed.model);

  return {
    payload,
    validation,
    diagnostics: [...parsed.diagnostics, ...validation.diagnostics],
    parameterCount: validation.parameters.length,
  };
}

function buildGeneratedSuite(args: {
  validation: ValidationResult;
  strength: number;
  sink: MeasuringSink;
  coverage: CoverageSnapshot;
  generationTimeMs: number;
}): GeneratedSuite {
  const model = normalizeValidatedModel(args.validation, args.strength);

  return {
    header: [...args.sink.header],
    rows: args.sink.rows.map((row) => [...row]),
    coverage: {
      strength: args.coverage.strength,
      requiredTupleCount: args.coverage.requiredTupleCount,
      coveredTupleCount: args.coverage.coveredTupleCount,
      uncoveredTupleCount: args.coverage.uncoveredTupleCount,
    },
    stats: {
      strength: args.strength,
      parameterCount: model.parameters.length,
      constraintCount: model.constraints.length,
      generatedRowCount: args.sink.rowCount,
      generationTimeMs: roundMilliseconds(args.generationTimeMs),
      uncoveredTupleCount: args.coverage.uncoveredTupleCount,
      candidateRowCount: 0,
      requiredTupleCount: args.coverage.requiredTupleCount,
    },
    warnings: [],
  };
}

function sampleHeapPeak(currentPeak: number): number {
  return Math.max(currentPeak, process.memoryUsage().heapUsed);
}

function maybeRunGc(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;

  for (const argument of process.argv.slice(2)) {
    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length);
    }
  }

  return undefined;
}

function readMode(): ScriptMode {
  const mode = getArgValue("--mode");

  if (mode === undefined || mode === "full") {
    return "full";
  }

  if (mode === "fixture-only" || mode === "sweep-only") {
    return mode;
  }

  throw new Error(`unsupported mode: ${mode}`);
}

async function measureCancellationDirect(
  validation: ValidationResult,
  strength: number,
): Promise<ChildCancelResult> {
  const model = normalizeValidatedModel(validation, strength);
  const sink = new MeasuringSink(false);
  const startedAt = performance.now();

  try {
    await generateSuiteStreaming(model, sink, {
      coverage: "lazy",
      hooks: {
        shouldCancel() {
          return performance.now() - startedAt >= cancellationTargetMs;
        },
      },
    });

    return {
      cancelMs: "error: generation completed before cancellation threshold",
    };
  } catch (error) {
    if (error instanceof CancelledError) {
      return {
        cancelMs: roundMilliseconds(performance.now() - startedAt),
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      cancelMs: `error: ${message}`,
    };
  }
}

async function measureFixtureDirect(filename: string): Promise<ChildMeasureResult> {
  const prepared = prepareFixture(filename);
  const baseline: ChildMeasureResult = {
    fixture: filename,
    parameterCount: prepared.parameterCount,
    strength: prepared.payload.strength,
    elapsedMs: 0,
    heapPeakBytes: 0,
    generatedRowCount: 0,
    uncoveredTupleCount: -1,
    constraintViolatingRows: -1,
    invalidTupleTargetedCount: -1,
  };

  if (hasErrorDiagnostics(prepared.diagnostics)) {
    return {
      ...baseline,
      error: `validation failed: ${describeDiagnostics(prepared.diagnostics)}`,
    };
  }

  const model = normalizeValidatedModel(prepared.validation, prepared.payload.strength);
  const sink = new MeasuringSink(true);
  const startedAt = performance.now();
  let heapPeakBytes = sampleHeapPeak(0);
  const sampler = setInterval(() => {
    heapPeakBytes = sampleHeapPeak(heapPeakBytes);
  }, 50);

  sampler.unref?.();

  try {
    await generateSuiteStreaming(model, sink, {
      coverage: "lazy",
    });

    heapPeakBytes = sampleHeapPeak(heapPeakBytes);
    const elapsedMs = roundMilliseconds(performance.now() - startedAt);
    const suite = buildGeneratedSuite({
      validation: prepared.validation,
      strength: prepared.payload.strength,
      sink,
      coverage: {
        strength: prepared.payload.strength,
        requiredTupleCount: 0,
        coveredTupleCount: 0,
        uncoveredTupleCount: 0,
      },
      generationTimeMs: elapsedMs,
    });
    const report = verifyGeneratedSuite({
      validation: prepared.validation,
      strength: prepared.payload.strength,
      suite,
    });

    return {
      ...baseline,
      elapsedMs,
      heapPeakBytes,
      generatedRowCount: sink.rowCount,
      uncoveredTupleCount: report.uncoveredTupleCount,
      constraintViolatingRows: report.constraintViolatingRows,
      invalidTupleTargetedCount: report.invalidTupleTargetedCount,
    };
  } catch (error) {
    heapPeakBytes = sampleHeapPeak(heapPeakBytes);
    const elapsedMs = roundMilliseconds(performance.now() - startedAt);
    const message = error instanceof Error ? error.message : String(error);

    return {
      ...baseline,
      elapsedMs,
      heapPeakBytes,
      generatedRowCount: sink.rowCount,
      error: `generation failed: ${message}`,
    };
  } finally {
    clearInterval(sampler);
  }
}

async function runChildPhase<T>(args: {
  fixture: string;
  mode: ChildMode;
  timeoutMs?: number;
}): Promise<ChildPhaseResult<T>> {
  return await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        scriptPath,
        `--child=${args.mode}`,
        `--fixture=${args.fixture}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;

    if (args.timeoutMs !== undefined) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");

        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1_000).unref?.();
      }, args.timeoutMs);

      killTimer.unref?.();
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (killTimer) {
        clearTimeout(killTimer);
      }

      resolve({
        kind: "error",
        message: error.message,
        stderr: stderrChunks.join(""),
      });
    });
    child.on("close", (code, signal) => {
      if (killTimer) {
        clearTimeout(killTimer);
      }

      const stdout = stdoutChunks.join("").trim();
      const stderr = stderrChunks.join("");

      if (timedOut) {
        resolve({
          kind: "timeout",
          timeoutMs: args.timeoutMs ?? 0,
          stderr,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          kind: "error",
          message: `child exited with code ${code ?? "null"} signal ${signal ?? "null"}`,
          stderr,
        });
        return;
      }

      try {
        resolve({
          kind: "success",
          value: JSON.parse(stdout) as T,
        });
      } catch (error) {
        resolve({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
          stderr: `${stderr}${stderr && stdout ? "\n" : ""}${stdout}`,
        });
      }
    });
  });
}

async function runParentMeasurement(): Promise<LegacyMeasurementRoot> {
  const results: OriginalFixtureMeasurementResult[] = [];

  for (const spec of fixtureSpecs) {
    const prepared = prepareFixture(spec.filename);
    const baseline: OriginalFixtureMeasurementResult = {
      fixture: spec.filename,
      parameterCount: prepared.parameterCount,
      strength: prepared.payload.strength,
      elapsedMs: 0,
      heapPeakBytes: 0,
      generatedRowCount: 0,
      uncoveredTupleCount: -1,
      constraintViolatingRows: -1,
      invalidTupleTargetedCount: -1,
      cancelMs: "error: not measured",
    };

    if (hasErrorDiagnostics(prepared.diagnostics)) {
      results.push({
        ...baseline,
        error: `validation failed: ${describeDiagnostics(prepared.diagnostics)}`,
      });
      continue;
    }

    const cancelPhase = await runChildPhase<ChildCancelResult>({
      fixture: spec.filename,
      mode: "cancel",
      timeoutMs: cancellationBudgetMs,
    });
    const cancelMs =
      cancelPhase.kind === "success"
        ? cancelPhase.value.cancelMs
        : cancelPhase.kind === "timeout"
          ? `error: exceeded ${cancelPhase.timeoutMs}ms cancel budget`
          : `error: ${cancelPhase.message}`;
    const measurePhase = await runChildPhase<ChildMeasureResult>({
      fixture: spec.filename,
      mode: "measure",
      timeoutMs: spec.timeoutMs,
    });

    if (measurePhase.kind === "success") {
      results.push({
        ...measurePhase.value,
        cancelMs,
      });
      continue;
    }

    if (measurePhase.kind === "timeout") {
      results.push({
        ...baseline,
        cancelMs,
        elapsedMs: measurePhase.timeoutMs,
        timeoutReason: `exceeded ${measurePhase.timeoutMs}ms fixture budget`,
      });
      continue;
    }

    results.push({
      ...baseline,
      cancelMs,
      error: `measurement child failed: ${measurePhase.message}`,
    });
  }

  const measuredAt = new Date();
  const root: LegacyMeasurementRoot = {
    measuredAt: measuredAt.toISOString(),
    measurementDate: formatMeasurementDate(measuredAt),
    nodeVersion: process.version,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    commitHash: readCommitHash(),
    results,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(legacyOutputPath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return root;
}

function readLegacyMeasurementResults(): OriginalFixtureMeasurementResult[] {
  if (!existsSync(legacyOutputPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(legacyOutputPath, "utf8")) as LegacyMeasurementRoot;
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

async function loadOriginalFixtureResults(
  mode: ScriptMode,
): Promise<OriginalFixtureMeasurementResult[]> {
  if (mode === "fixture-only") {
    return (await runParentMeasurement()).results;
  }

  const cached = readLegacyMeasurementResults();
  if (cached.length > 0) {
    return cached;
  }

  return (await runParentMeasurement()).results;
}

function buildSyntheticModel(
  parameterCount: number,
  valueCount: number,
  strength: number,
  constraints: ConstraintMode = "none",
): string {
  if (parameterCount < 2) {
    throw new RangeError(`parameterCount must be >= 2 (received ${parameterCount})`);
  }
  if (valueCount < 2) {
    throw new RangeError(`valueCount must be >= 2 (received ${valueCount})`);
  }
  if (strength < 2) {
    throw new RangeError(`strength must be >= 2 (received ${strength})`);
  }

  const width = Math.max(2, String(parameterCount).length);
  const valueText = Array.from({ length: valueCount }, (_unused, index) => String(index)).join(
    ", ",
  );
  const parameterLines = Array.from({ length: parameterCount }, (_unused, index) => {
    const name = `P${String(index + 1).padStart(width, "0")}`;
    return `${name}: ${valueText}`;
  });

  if (constraints !== "light") {
    return parameterLines.join("\n");
  }

  const lastStart = Math.max(0, parameterCount - 3);
  const lightConstraints = [
    `IF [P${String(lastStart + 1).padStart(width, "0")}] = 0 THEN [P${String(
      lastStart + 2,
    ).padStart(width, "0")}] <> 0;`,
    `IF [P${String(lastStart + 2).padStart(width, "0")}] = 0 THEN [P${String(
      lastStart + 3,
    ).padStart(width, "0")}] <> 0;`,
  ];

  return `${parameterLines.join("\n")}\n\n${lightConstraints.join("\n")}`;
}

function prepareValidationFromText(source: string): {
  validation: ValidationResult;
  diagnostics: Diagnostic[];
} {
  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);

  return {
    validation,
    diagnostics: [...parsed.diagnostics, ...validation.diagnostics],
  };
}

function measurementCoverageSnapshot(
  planner: StreamingGenerationPlanner | null,
  strength: number,
): CoverageSnapshot {
  if (!planner) {
    return {
      strength,
      requiredTupleCount: 0,
      coveredTupleCount: 0,
      uncoveredTupleCount: 0,
    };
  }

  const coverage = planner.coverage();
  return {
    strength: coverage.strength,
    requiredTupleCount: coverage.requiredTupleCount,
    coveredTupleCount: coverage.coveredTupleCount,
    uncoveredTupleCount: coverage.uncoveredTupleCount,
  };
}

function basePhaseMeasurement(args: {
  coverage: CoverageSnapshot;
  ctorMs: number;
  firstRowMs: number;
  remainingRowsMs: number;
  verifierMs?: number | null;
  elapsedMs: number;
  generatedRowCount: number;
  heapBaselineBytes: number;
  heapPeakBytes: number;
  timeoutReason: string | null;
  error?: string;
  report?: VerifierReport;
}): PhaseSeparatedMeasurement {
  const uncoveredTupleCount = args.report?.uncoveredTupleCount ?? args.coverage.uncoveredTupleCount;

  return {
    ctorMs: args.ctorMs,
    firstRowMs: args.firstRowMs,
    remainingRowsMs: args.remainingRowsMs,
    verifierMs: args.verifierMs ?? null,
    fullRunMs:
      args.timeoutReason || args.error
        ? args.elapsedMs
        : roundMilliseconds(args.ctorMs + args.firstRowMs + args.remainingRowsMs),
    elapsedMs: args.elapsedMs,
    generatedRowCount: args.generatedRowCount,
    requiredTupleCount: args.coverage.requiredTupleCount,
    coveredTupleCount: args.coverage.coveredTupleCount,
    uncoveredTupleCount,
    constraintViolatingRows: args.report?.constraintViolatingRows ?? null,
    invalidTupleTargetedCount: args.report?.invalidTupleTargetedCount ?? null,
    rowsWithMultipleNegativeValues: args.report?.rowsWithMultipleNegativeValues ?? null,
    heapBaselineBytes: args.heapBaselineBytes,
    heapPeakBytes: args.heapPeakBytes,
    heapDeltaBytes: Math.max(0, args.heapPeakBytes - args.heapBaselineBytes),
    timeoutReason: args.timeoutReason,
    ...(args.error ? { error: args.error } : {}),
  };
}

async function closeSinkOnce(
  sink: MeasuringSink,
  state: {
    closed: boolean;
  },
): Promise<void> {
  if (state.closed) {
    return;
  }

  state.closed = true;
  await sink.close();
}

async function measurePlannerRun(args: {
  validation: ValidationResult;
  strength: number;
  coverage: CoverageMode;
  timeoutMs: number;
}): Promise<PhaseSeparatedMeasurement> {
  maybeRunGc();

  const model = normalizeValidatedModel(args.validation, args.strength);
  const sink = new MeasuringSink(true);
  const sinkState = { closed: false };
  const startedAt = performance.now();
  const heapBaselineBytes = process.memoryUsage().heapUsed;
  let heapPeakBytes = heapBaselineBytes;
  const sample = () => {
    heapPeakBytes = sampleHeapPeak(heapPeakBytes);
  };
  let planner: StreamingGenerationPlanner | null = null;
  let ctorMs = 0;
  let firstRowMs = 0;
  let remainingRowsMs = 0;

  const elapsedMs = () => roundMilliseconds(performance.now() - startedAt);
  const exceededTimeout = () => performance.now() - startedAt > args.timeoutMs;
  const buildTimeoutMeasurement = async (phase: string): Promise<PhaseSeparatedMeasurement> => {
    await closeSinkOnce(sink, sinkState);
    sample();
    return basePhaseMeasurement({
      coverage: measurementCoverageSnapshot(planner, args.strength),
      ctorMs,
      firstRowMs,
      remainingRowsMs,
      elapsedMs: elapsedMs(),
      generatedRowCount: sink.rowCount,
      heapBaselineBytes,
      heapPeakBytes,
      timeoutReason: `exceeded ${args.timeoutMs}ms during ${phase}`,
    });
  };

  try {
    const ctorStartedAt = performance.now();
    planner = createStreamingGenerationPlanner(model, {
      coverage: args.coverage,
    });
    ctorMs = roundMilliseconds(performance.now() - ctorStartedAt);
    sample();

    await sink.writeHeader(planner.header);

    if (exceededTimeout()) {
      return await buildTimeoutMeasurement("planner constructor");
    }

    const firstRowStartedAt = performance.now();
    const firstRow = planner.nextRow();
    firstRowMs = roundMilliseconds(performance.now() - firstRowStartedAt);
    sample();

    if (firstRow) {
      await sink.writeRow(planner.toDisplayRow(firstRow));
      planner.acceptRow(firstRow);
      sample();
    }

    if (exceededTimeout()) {
      return await buildTimeoutMeasurement("first row");
    }

    const remainingStartedAt = performance.now();

    for (;;) {
      const row = planner.nextRow();
      sample();

      if (!row) {
        break;
      }

      await sink.writeRow(planner.toDisplayRow(row));
      planner.acceptRow(row);
      sample();

      if (exceededTimeout()) {
        remainingRowsMs = roundMilliseconds(performance.now() - remainingStartedAt);
        return await buildTimeoutMeasurement("generation");
      }
    }

    remainingRowsMs = roundMilliseconds(performance.now() - remainingStartedAt);
    await closeSinkOnce(sink, sinkState);
    sample();

    const generationElapsedMs = elapsedMs();
    const suite = buildGeneratedSuite({
      validation: args.validation,
      strength: args.strength,
      sink,
      coverage: measurementCoverageSnapshot(planner, args.strength),
      generationTimeMs: generationElapsedMs,
    });

    const verifierStartedAt = performance.now();
    const report = verifyGeneratedSuite({
      validation: args.validation,
      strength: args.strength,
      suite,
    });
    const verifierMs = roundMilliseconds(performance.now() - verifierStartedAt);
    sample();

    return basePhaseMeasurement({
      coverage: measurementCoverageSnapshot(planner, args.strength),
      ctorMs,
      firstRowMs,
      remainingRowsMs,
      verifierMs,
      elapsedMs: elapsedMs(),
      generatedRowCount: sink.rowCount,
      heapBaselineBytes,
      heapPeakBytes,
      timeoutReason: null,
      report,
    });
  } catch (error) {
    await closeSinkOnce(sink, sinkState);
    sample();

    return basePhaseMeasurement({
      coverage: measurementCoverageSnapshot(planner, args.strength),
      ctorMs,
      firstRowMs,
      remainingRowsMs,
      elapsedMs: elapsedMs(),
      generatedRowCount: sink.rowCount,
      heapBaselineBytes,
      heapPeakBytes,
      timeoutReason: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function measureSyntheticSweepCase(
  spec: SweepCaseSpec,
  coverage: CoverageMode,
): Promise<SweepMeasurement> {
  const source = buildSyntheticModel(spec.n, spec.v, spec.t, spec.constraints);
  const prepared = prepareValidationFromText(source);

  if (hasErrorDiagnostics(prepared.diagnostics)) {
    return {
      coverage,
      n: spec.n,
      v: spec.v,
      t: spec.t,
      constraints: spec.constraints,
      ...basePhaseMeasurement({
        coverage: {
          strength: spec.t,
          requiredTupleCount: 0,
          coveredTupleCount: 0,
          uncoveredTupleCount: 0,
        },
        ctorMs: 0,
        firstRowMs: 0,
        remainingRowsMs: 0,
        elapsedMs: 0,
        generatedRowCount: 0,
        heapBaselineBytes: process.memoryUsage().heapUsed,
        heapPeakBytes: process.memoryUsage().heapUsed,
        timeoutReason: null,
        error: `validation failed: ${describeDiagnostics(prepared.diagnostics)}`,
      }),
    };
  }

  return {
    coverage,
    n: spec.n,
    v: spec.v,
    t: spec.t,
    constraints: spec.constraints,
    ...(await measurePlannerRun({
      validation: prepared.validation,
      strength: spec.t,
      coverage,
      timeoutMs: sweepCaseTimeoutMs,
    })),
  };
}

async function runSweepMeasurements(): Promise<SweepMeasurement[]> {
  const results: SweepMeasurement[] = [];
  const coverageModes: CoverageMode[] = ["eager", "lazy"];

  for (const coverage of coverageModes) {
    const skipThresholdByKey = new Map<string, number>();

    for (const spec of sweepCaseSpecs) {
      const key = `${spec.constraints}|v=${spec.v}|t=${spec.t}`;
      const skippedAbove = skipThresholdByKey.get(key);

      if (skippedAbove !== undefined && spec.n > skippedAbove) {
        results.push({
          coverage,
          n: spec.n,
          v: spec.v,
          t: spec.t,
          constraints: spec.constraints,
          skippedBecauseLarger: true,
          ...basePhaseMeasurement({
            coverage: {
              strength: spec.t,
              requiredTupleCount: 0,
              coveredTupleCount: 0,
              uncoveredTupleCount: 0,
            },
            ctorMs: 0,
            firstRowMs: 0,
            remainingRowsMs: 0,
            elapsedMs: 0,
            generatedRowCount: 0,
            heapBaselineBytes: process.memoryUsage().heapUsed,
            heapPeakBytes: process.memoryUsage().heapUsed,
            timeoutReason: `skipped after timeout at smaller n (>${skippedAbove})`,
          }),
        });
        continue;
      }

      const measured = await measureSyntheticSweepCase(spec, coverage);
      results.push(measured);

      if (measured.timeoutReason && !measured.skippedBecauseLarger) {
        skipThresholdByKey.set(key, spec.n);
      }
    }
  }

  return results;
}

async function runConstrainedFixtureMeasurements(): Promise<{
  fixture: string;
  eager: ConstrainedFixtureMeasurement | null;
  lazy: ConstrainedFixtureMeasurement | null;
}> {
  const prepared = prepareFixture(constrainedFixtureName);

  if (hasErrorDiagnostics(prepared.diagnostics)) {
    const failedMeasurement = (coverage: CoverageMode): ConstrainedFixtureMeasurement => ({
      coverage,
      fixture: constrainedFixtureName,
      ...basePhaseMeasurement({
        coverage: {
          strength: prepared.payload.strength,
          requiredTupleCount: 0,
          coveredTupleCount: 0,
          uncoveredTupleCount: 0,
        },
        ctorMs: 0,
        firstRowMs: 0,
        remainingRowsMs: 0,
        elapsedMs: 0,
        generatedRowCount: 0,
        heapBaselineBytes: process.memoryUsage().heapUsed,
        heapPeakBytes: process.memoryUsage().heapUsed,
        timeoutReason: null,
        error: `validation failed: ${describeDiagnostics(prepared.diagnostics)}`,
      }),
    });

    return {
      fixture: constrainedFixtureName,
      eager: failedMeasurement("eager"),
      lazy: failedMeasurement("lazy"),
    };
  }

  const eager = await measurePlannerRun({
    validation: prepared.validation,
    strength: prepared.payload.strength,
    coverage: "eager",
    timeoutMs: constrainedFixtureTimeoutMs,
  });
  const lazy = await measurePlannerRun({
    validation: prepared.validation,
    strength: prepared.payload.strength,
    coverage: "lazy",
    timeoutMs: constrainedFixtureTimeoutMs,
  });

  return {
    fixture: constrainedFixtureName,
    eager: {
      coverage: "eager",
      fixture: constrainedFixtureName,
      ...eager,
    },
    lazy: {
      coverage: "lazy",
      fixture: constrainedFixtureName,
      ...lazy,
    },
  };
}

async function measureCancelResponseForCase(
  spec: SweepCaseSpec,
  coverage: CoverageMode,
  targetMs: number,
): Promise<number | string> {
  const source = buildSyntheticModel(spec.n, spec.v, spec.t, spec.constraints);
  const prepared = prepareValidationFromText(source);

  if (hasErrorDiagnostics(prepared.diagnostics)) {
    return `error: validation failed: ${describeDiagnostics(prepared.diagnostics)}`;
  }

  const model = normalizeValidatedModel(prepared.validation, spec.t);
  const sink = new MeasuringSink(false);
  const startedAt = performance.now();

  try {
    await generateSuiteStreaming(model, sink, {
      coverage,
      hooks: {
        shouldCancel() {
          return performance.now() - startedAt >= targetMs;
        },
      },
    });

    return "error: generation completed before cancellation threshold";
  } catch (error) {
    if (error instanceof CancelledError) {
      return roundMilliseconds(performance.now() - startedAt);
    }

    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function runCancelMeasurement(
  sweep: readonly SweepMeasurement[],
): Promise<CancelMeasurement | null> {
  const candidates = sweep
    .filter(
      (entry) =>
        entry.coverage === "lazy" &&
        !entry.timeoutReason &&
        !entry.error &&
        entry.generatedRowCount > 0 &&
        entry.fullRunMs >= detailedCancelTargetMs,
    )
    .sort((left, right) => {
      const leftDistance = Math.abs(left.fullRunMs - 2_000);
      const rightDistance = Math.abs(right.fullRunMs - 2_000);

      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return left.fullRunMs - right.fullRunMs;
    });

  for (const candidate of candidates) {
    const actualMs = await measureCancelResponseForCase(candidate, "lazy", detailedCancelTargetMs);
    if (typeof actualMs === "number") {
      return {
        case: {
          n: candidate.n,
          v: candidate.v,
          t: candidate.t,
          coverage: "lazy",
          constraints: candidate.constraints,
        },
        targetMs: detailedCancelTargetMs,
        actualMs,
      };
    }
  }

  const fallback = sweepCaseSpecs.find(
    (spec) => spec.n === 15 && spec.v === 5 && spec.t === 2 && spec.constraints === "none",
  );

  if (!fallback) {
    return null;
  }

  return {
    case: {
      n: fallback.n,
      v: fallback.v,
      t: fallback.t,
      coverage: "lazy",
      constraints: fallback.constraints,
    },
    targetMs: detailedCancelTargetMs,
    actualMs: await measureCancelResponseForCase(fallback, "lazy", detailedCancelTargetMs),
  };
}

async function runDetailedMeasurement(mode: ScriptMode): Promise<DetailedMeasurementRoot> {
  const originalFixtures = await loadOriginalFixtureResults(mode);
  const shouldRunDetailedSuites = mode !== "fixture-only";
  const sweep = shouldRunDetailedSuites ? await runSweepMeasurements() : [];
  const constrainedFixture = shouldRunDetailedSuites
    ? await runConstrainedFixtureMeasurements()
    : {
        fixture: constrainedFixtureName,
        eager: null,
        lazy: null,
      };
  const cancel = shouldRunDetailedSuites ? await runCancelMeasurement(sweep) : null;
  const measuredAt = new Date();
  const root: DetailedMeasurementRoot = {
    measuredAt: measuredAt.toISOString(),
    measurementDate: formatMeasurementDate(measuredAt),
    measurementCommand: `node --experimental-strip-types scripts/run-poc-measurement.ts --mode=${mode}`,
    nodeVersion: process.version,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    osLabel: `${os.platform()} ${os.release()}`,
    commitHash: readCommitHash(),
    originalFixtures,
    sweep,
    constrainedFixture,
    cancel,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(detailedOutputPath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return root;
}

async function main(): Promise<void> {
  const childMode = getArgValue("--child");
  const fixture = getArgValue("--fixture");

  if (childMode === "cancel" || childMode === "measure") {
    if (!fixture) {
      throw new Error("missing --fixture for child execution");
    }

    const prepared = prepareFixture(fixture);
    if (hasErrorDiagnostics(prepared.diagnostics)) {
      throw new Error(`fixture diagnostics: ${describeDiagnostics(prepared.diagnostics)}`);
    }

    const result =
      childMode === "measure"
        ? await measureFixtureDirect(fixture)
        : await measureCancellationDirect(prepared.validation, prepared.payload.strength);
    process.stdout.write(JSON.stringify(result));
    return;
  }

  const mode = readMode();
  const detailed = await runDetailedMeasurement(mode);
  process.stdout.write(`${JSON.stringify(detailed, null, 2)}\n`);
}

void main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
