import { hasErrorDiagnostics } from "../diagnostics/index.ts";
import type { Diagnostic, SourceSpan } from "../diagnostics/types.ts";
import {
  enumerateCandidateRows,
  selectRowsForCoverage,
  type CoverageRowRecord,
} from "../coverage/analyze-coverage.ts";
import type {
  CanonicalModel,
  GenerateRequest,
  GenerateResult,
  ValidationResult,
} from "../model/types.ts";
import { SourceFile } from "../parser/source-file.ts";
import { normalizeValidatedModel } from "./normalize-model.ts";

const MAX_CANDIDATE_ROW_UPPER_BOUND = 200_000n;
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

function shuffleArray<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
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

function estimateCandidateRowUpperBound(model: CanonicalModel, limit: bigint): bigint {
  const positiveCounts = model.parameters.map((parameter) =>
    BigInt(parameter.positiveValueIndices.length),
  );
  const prefixProducts: bigint[] = [1n];
  const suffixProducts = new Array<bigint>(model.parameters.length + 1).fill(1n);

  for (const count of positiveCounts) {
    prefixProducts.push(
      multiplyCapped(prefixProducts[prefixProducts.length - 1] ?? 1n, count, limit),
    );
  }

  for (let index = model.parameters.length - 1; index >= 0; index -= 1) {
    suffixProducts[index] = multiplyCapped(
      suffixProducts[index + 1] ?? 1n,
      positiveCounts[index] ?? 0n,
      limit,
    );
  }

  let total = prefixProducts[model.parameters.length] ?? 0n;

  for (let index = 0; index < model.parameters.length; index += 1) {
    const negativeCount = BigInt(model.parameters[index]?.negativeValueIndices.length ?? 0);
    if (negativeCount === 0n) {
      continue;
    }

    const positiveProductWithoutParameter = multiplyCapped(
      prefixProducts[index] ?? 1n,
      suffixProducts[index + 1] ?? 1n,
      limit,
    );
    const rowsWithNegativeValue = multiplyCapped(
      negativeCount,
      positiveProductWithoutParameter,
      limit,
    );
    total = addCapped(total, rowsWithNegativeValue, limit);
  }

  return total;
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

function matchesRowValues(values: string[], seedRow: ReadonlyArray<string>): boolean {
  return (
    values.length === seedRow.length && values.every((value, index) => value === seedRow[index])
  );
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
  const candidateRowUpperBound = estimateCandidateRowUpperBound(
    canonicalModel,
    MAX_CANDIDATE_ROW_UPPER_BOUND,
  );
  if (candidateRowUpperBound > MAX_CANDIDATE_ROW_UPPER_BOUND) {
    return {
      suite: null,
      diagnostics: [
        ...diagnostics,
        getSearchSpaceDiagnostic(
          validation,
          sourceFile,
          "generator.request.candidate_space_too_large",
          "候補行",
          candidateRowUpperBound,
          MAX_CANDIDATE_ROW_UPPER_BOUND,
        ),
      ],
    };
  }

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

  let candidateRows = enumerateCandidateRows(canonicalModel);

  if (candidateRows.length === 0) {
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

  if (request.randomSeed !== undefined) {
    candidateRows = shuffleArray(candidateRows, mulberry32(request.randomSeed));
  }

  const preSelectedRows: CoverageRowRecord[] = [];
  for (const seedRow of request.seedRows ?? []) {
    const matchedRow = candidateRows.find((candidateRow) =>
      matchesRowValues(candidateRow.values, seedRow),
    );
    if (!matchedRow) {
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

    if (!preSelectedRows.includes(matchedRow)) {
      preSelectedRows.push(matchedRow);
    }
  }

  const selection = selectRowsForCoverage(
    canonicalModel,
    candidateRows,
    preSelectedRows.length > 0 ? preSelectedRows : undefined,
  );
  const warnings = [...diagnostics];

  if (selection.coverage.uncoveredTupleCount > 0) {
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
      rows: selection.selectedRows.map((row) => row.values),
      coverage: selection.coverage,
      stats: {
        strength: canonicalModel.options.strength,
        parameterCount: canonicalModel.parameters.length,
        constraintCount: canonicalModel.constraints.length,
        generatedRowCount: selection.selectedRows.length,
        generationTimeMs: Date.now() - startedAt,
        uncoveredTupleCount: selection.coverage.uncoveredTupleCount,
        candidateRowCount: candidateRows.length,
        requiredTupleCount: selection.coverage.requiredTupleCount,
      },
      warnings,
    },
    diagnostics: warnings,
  };
}
