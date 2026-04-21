import { hasErrorDiagnostics } from "../diagnostics/index.ts";
import type { Diagnostic, SourceSpan } from "../diagnostics/types.ts";
import { CollectingSink, collectedRows } from "../exporters/index.ts";
import type {
  CanonicalModel,
  GenerateRequest,
  GenerateResult,
  ValidationResult,
} from "../model/types.ts";
import { SourceFile } from "../parser/source-file.ts";
import { createDfsValidityOracle } from "../oracle/dfs-oracle.ts";
import { normalizeValidatedModel } from "./normalize-model.ts";
import { createStreamingGenerationPlanner } from "./streaming-generator.ts";

const MAX_REQUIRED_TUPLE_UPPER_BOUND = 2_000_000n;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(array: readonly T[], rng: () => number): T[] {
  const result = [...array];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function wholeSourceSpan(source: string): SourceSpan {
  return {
    start: 0,
    end: Math.max(source.length, 1),
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

function formatBigInt(value: bigint): string {
  return value.toString();
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

function getSearchSpaceDiagnostic(
  validation: ValidationResult,
  sourceFile: SourceFile,
  code: string,
  kind: "候補行" | "必要組",
  estimated: bigint,
  limit: bigint,
): Diagnostic {
  return sourceFile.createDiagnostic(
    code,
    "error",
    `${kind}の上限見積り ${formatBigInt(estimated)} が安全上限 ${formatBigInt(
      limit,
    )} を超えるため生成を中断しました。parameter を分割するか strength を下げてください`,
    wholeSourceSpan(validation.source),
  );
}

function resolveSeedRowValueIndices(
  model: CanonicalModel,
  seedRow: ReadonlyArray<string>,
): number[] | null {
  if (seedRow.length !== model.parameters.length) {
    return null;
  }

  const valueIndices: number[] = [];

  for (let parameterIndex = 0; parameterIndex < seedRow.length; parameterIndex += 1) {
    const parameter = model.parameters[parameterIndex];
    const valueIndex = parameter.values.findIndex(
      (candidate) => candidate.displayText === seedRow[parameterIndex],
    );
    if (valueIndex < 0) {
      return null;
    }

    valueIndices.push(valueIndex);
  }

  return valueIndices;
}

function resolveStrength(
  validation: ValidationResult,
  request: GenerateRequest | undefined,
  sourceFile: SourceFile,
): { strength: number | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const requestedStrength = request?.strength ?? 2;
  const strength =
    requestedStrength === "max" ? validation.parameters.length : Number(requestedStrength);

  if (!Number.isInteger(strength) || strength < 1) {
    diagnostics.push(
      sourceFile.createDiagnostic(
        "generator.request.invalid_strength",
        "error",
        "strength は 1 以上の整数か 'max' を指定してください",
        wholeSourceSpan(validation.source),
      ),
    );
    return {
      strength: null,
      diagnostics,
    };
  }

  if (validation.parameters.length > 0 && strength > validation.parameters.length) {
    diagnostics.push(
      sourceFile.createDiagnostic(
        "generator.request.strength_too_large",
        "error",
        `strength=${strength} は parameter 数 ${validation.parameters.length} を超えています`,
        wholeSourceSpan(validation.source),
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

function collectFeatureDiagnostics(
  validation: ValidationResult,
  sourceFile: SourceFile,
): { warnings: Diagnostic[]; errors: Diagnostic[] } {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];

  for (const submodel of validation.submodels) {
    warnings.push(
      sourceFile.createDiagnostic(
        "generator.feature.submodel_ignored",
        "warning",
        "sub-model は初版ではまだ反映されません (無視して全体で生成します)",
        submodel.span,
      ),
    );
  }

  let weightWarningAdded = false;
  for (const parameter of validation.parameters) {
    for (const value of parameter.values) {
      if (value.source === "reference") {
        errors.push(
          sourceFile.createDiagnostic(
            "generator.feature.reference_value_unsupported",
            "error",
            "reference value は generator core の初版ではまだ未対応です",
            value.span,
          ),
        );
      }

      if (!weightWarningAdded && value.explicitWeight) {
        warnings.push(
          sourceFile.createDiagnostic(
            "generator.feature.weight_ignored",
            "warning",
            "weight 指定は generator core の初版ではまだ反映されません",
            value.span,
          ),
        );
        weightWarningAdded = true;
      }
    }
  }

  return { warnings, errors };
}

export function generateTestSuite(
  validation: ValidationResult,
  request: GenerateRequest = {},
): GenerateResult {
  const startedAt = Date.now();
  const diagnostics: Diagnostic[] = [...validation.diagnostics];

  if (hasErrorDiagnostics(diagnostics)) {
    return {
      suite: null,
      diagnostics,
    };
  }

  const sourceFile = new SourceFile(validation.source);
  const { strength, diagnostics: strengthDiagnostics } = resolveStrength(
    validation,
    request,
    sourceFile,
  );

  if (strength === null) {
    return {
      suite: null,
      diagnostics: [...diagnostics, ...strengthDiagnostics],
    };
  }

  const featureDiagnostics = collectFeatureDiagnostics(validation, sourceFile);
  diagnostics.push(...featureDiagnostics.warnings);

  if (featureDiagnostics.errors.length > 0) {
    return {
      suite: null,
      diagnostics: [...diagnostics, ...featureDiagnostics.errors],
    };
  }

  const canonicalModel = normalizeValidatedModel(validation, strength);
  const requiredTupleUpperBound = estimateRequiredTupleUpperBound(
    canonicalModel.parameters.map((parameter) => BigInt(parameter.values.length)),
    canonicalModel.options.strength,
    MAX_REQUIRED_TUPLE_UPPER_BOUND,
  );
  if (requiredTupleUpperBound > MAX_REQUIRED_TUPLE_UPPER_BOUND) {
    return {
      suite: null,
      diagnostics: [
        ...diagnostics,
        getSearchSpaceDiagnostic(
          validation,
          sourceFile,
          "generator.request.coverage_space_too_large",
          "必要組",
          requiredTupleUpperBound,
          MAX_REQUIRED_TUPLE_UPPER_BOUND,
        ),
      ],
    };
  }

  const solver = createDfsValidityOracle(canonicalModel);

  if (!solver.canComplete(new Map<number, number>())) {
    return {
      suite: null,
      diagnostics: [
        ...diagnostics,
        sourceFile.createDiagnostic(
          "generator.model.unsatisfiable",
          "error",
          "制約を満たす組み合わせが存在しません",
          wholeSourceSpan(validation.source),
        ),
      ],
    };
  }

  const matchedSeedRows: number[][] = [];
  for (const seedRow of request.seedRows ?? []) {
    const valueIndices = resolveSeedRowValueIndices(canonicalModel, seedRow);
    if (!valueIndices) {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "generator.seed.unmatched_row",
          "warning",
          `seed row (${seedRow.join(", ")}) は候補行に一致しないため無視しました`,
          wholeSourceSpan(validation.source),
        ),
      );
      continue;
    }

    matchedSeedRows.push(valueIndices);
  }

  const sink = new CollectingSink();
  const planner = createStreamingGenerationPlanner(canonicalModel, {
    randomSeed: request.randomSeed,
    seedRows: matchedSeedRows,
  });

  sink.writeHeader(planner.header);

  for (;;) {
    const valueIndices = planner.nextRow();
    if (!valueIndices) {
      break;
    }

    sink.writeRow(planner.toDisplayRow(valueIndices));
    planner.acceptRow(valueIndices);
  }

  sink.close();

  const coverage = planner.coverage();
  const rows = collectedRows(sink).map((row) => [...row]);
  const normalizedRows =
    request.randomSeed !== undefined && (request.seedRows?.length ?? 0) === 0
      ? shuffleArray(rows, mulberry32(request.randomSeed))
      : rows;

  for (const warning of planner.seedWarnings) {
    const seedRow = request.seedRows?.[warning.rowIndex] ?? [];
    const message =
      warning.reason === "constraint_violation"
        ? `seed row (${seedRow.join(", ")}) は制約違反のため無視しました`
        : `seed row (${seedRow.join(", ")}) は候補行に一致しないため無視しました`;

    diagnostics.push(
      sourceFile.createDiagnostic(
        "generator.seed.unmatched_row",
        "warning",
        message,
        wholeSourceSpan(validation.source),
      ),
    );
  }

  const warnings = [...diagnostics];

  if (coverage.uncoveredTupleCount > 0) {
    warnings.push(
      sourceFile.createDiagnostic(
        "generator.coverage.partial",
        "warning",
        "一部の tuple を覆いきれませんでした",
        wholeSourceSpan(validation.source),
      ),
    );
  }

  return {
    suite: {
      header: canonicalModel.parameters.map((parameter) => parameter.displayName),
      rows: normalizedRows,
      coverage,
      stats: {
        strength: canonicalModel.options.strength,
        parameterCount: canonicalModel.parameters.length,
        constraintCount: canonicalModel.constraints.length,
        generatedRowCount: normalizedRows.length,
        generationTimeMs: Date.now() - startedAt,
        uncoveredTupleCount: coverage.uncoveredTupleCount,
        candidateRowCount: normalizedRows.length,
        requiredTupleCount: coverage.requiredTupleCount,
      },
      warnings,
    },
    diagnostics: warnings,
  };
}
