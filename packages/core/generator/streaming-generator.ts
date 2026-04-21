import type { RowSink } from "../exporters/row-sink.ts";
import type { CanonicalModel, CoverageSummary } from "../model/types.ts";
import { createLazyCoverageTracker } from "../coverage/lazy-coverage-tracker.ts";
import { createValidTupleTracker } from "../coverage/valid-tuple-tracker.ts";
import { createDfsValidityOracle } from "../oracle/dfs-oracle.ts";

export type StreamingGeneratorHooks = {
  onProgress?: (covered: number, required: number) => void;
  shouldCancel?: () => boolean;
};

export type StreamingGenerationStats = {
  generatedRowCount: number;
  coverage: CoverageSummary;
};

export type SeedWarningReason = "unmatched_row" | "constraint_violation";

export type StreamingSeedWarning = {
  rowIndex: number;
  reason: SeedWarningReason;
};

export type StreamingGeneratorOptions = {
  coverage?: "eager" | "lazy";
  randomSeed?: number;
  seedRows?: readonly number[][];
  hooks?: StreamingGeneratorHooks;
};

export type StreamingGenerationResult = {
  stats: StreamingGenerationStats;
  seedWarnings: StreamingSeedWarning[];
};

export interface StreamingGenerationPlanner {
  readonly header: readonly string[];
  readonly seedWarnings: readonly StreamingSeedWarning[];
  nextRow(): number[] | null;
  acceptRow(valueIndices: readonly number[]): void;
  coverage(): CoverageSummary;
  generatedRowCount(): number;
  toDisplayRow(valueIndices: readonly number[]): string[];
}

export class CancelledError extends Error {
  constructor(message = "generation cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

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

function buildValueRanks(model: CanonicalModel, randomSeed: number | undefined): number[][] {
  return model.parameters.map((parameter, parameterIndex) => {
    const valueIndices = parameter.values.map((value) => value.valueIndex);
    const ordered =
      randomSeed === undefined
        ? valueIndices
        : shuffleArray(valueIndices, mulberry32(randomSeed ^ ((parameterIndex + 1) * 0x9e3779b9)));
    const ranks = new Array<number>(parameter.values.length).fill(0);

    for (let rank = 0; rank < ordered.length; rank += 1) {
      ranks[ordered[rank]] = rank;
    }

    return ranks;
  });
}

function compareValueIndices(
  left: number,
  right: number,
  parameterIndex: number,
  valueRanks: readonly number[][],
): number {
  const leftRank = valueRanks[parameterIndex]?.[left] ?? left;
  const rightRank = valueRanks[parameterIndex]?.[right] ?? right;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left - right;
}

function createFullAssignment(valueIndices: readonly number[]): Map<number, number> {
  return new Map(valueIndices.map((valueIndex, parameterIndex) => [parameterIndex, valueIndex]));
}

function isValueIndexRow(model: CanonicalModel, valueIndices: readonly number[]): boolean {
  if (valueIndices.length !== model.parameters.length) {
    return false;
  }

  for (let parameterIndex = 0; parameterIndex < valueIndices.length; parameterIndex += 1) {
    const valueIndex = valueIndices[parameterIndex];
    if (!Number.isInteger(valueIndex)) {
      return false;
    }

    const parameter = model.parameters[parameterIndex];
    if (!parameter || valueIndex < 0 || valueIndex >= parameter.values.length) {
      return false;
    }
  }

  return true;
}

function buildRowFromPartial(
  partial: Map<number, number>,
  parameterCount: number,
): number[] | null {
  const row: number[] = [];

  for (let parameterIndex = 0; parameterIndex < parameterCount; parameterIndex += 1) {
    const valueIndex = partial.get(parameterIndex);
    if (valueIndex === undefined) {
      return null;
    }
    row.push(valueIndex);
  }

  return row;
}

export function createStreamingGenerationPlanner(
  model: CanonicalModel,
  options: Omit<StreamingGeneratorOptions, "hooks"> = {},
): StreamingGenerationPlanner {
  const solver = createDfsValidityOracle(model);
  const coverageMode = options.coverage ?? "lazy";
  const tracker =
    coverageMode === "lazy"
      ? createLazyCoverageTracker(model, solver)
      : createValidTupleTracker(model, solver.canComplete);
  const header = model.parameters.map((parameter) => parameter.displayName);
  const seedWarnings: StreamingSeedWarning[] = [];
  const seedRows: number[][] = [];
  const seenSeedRows = new Set<string>();
  const valueRanks = buildValueRanks(model, options.randomSeed);
  let generatedRowCount = 0;
  let seedRowIndex = 0;

  for (const [rowIndex, seedRow] of (options.seedRows ?? []).entries()) {
    if (!isValueIndexRow(model, seedRow)) {
      seedWarnings.push({ rowIndex, reason: "unmatched_row" });
      continue;
    }

    const row = [...seedRow];
    if (!solver.canComplete(createFullAssignment(row))) {
      seedWarnings.push({ rowIndex, reason: "constraint_violation" });
      continue;
    }

    const key = row.join("\u0001");
    if (seenSeedRows.has(key)) {
      continue;
    }

    seenSeedRows.add(key);
    seedRows.push(row);
  }

  const chooseGeneratedRow = (): number[] | null => {
    const seedTuple = tracker.pickUncoveredTuple();
    if (!seedTuple) {
      return null;
    }

    const partial = new Map<number, number>();
    for (let index = 0; index < seedTuple.subset.length; index += 1) {
      partial.set(seedTuple.subset[index], seedTuple.values[index]);
    }

    for (let parameterIndex = 0; parameterIndex < model.parameters.length; parameterIndex += 1) {
      if (partial.has(parameterIndex)) {
        continue;
      }

      const feasibleValues = solver
        .feasibleValues(partial, parameterIndex)
        .sort((left, right) => compareValueIndices(left, right, parameterIndex, valueRanks));
      let bestValueIndex: number | null = null;
      let bestScore = -1;

      for (const valueIndex of feasibleValues) {
        const nextPartial = new Map(partial);
        nextPartial.set(parameterIndex, valueIndex);
        const completedRow = solver.completeRow(nextPartial);
        if (!completedRow) {
          continue;
        }

        const score = tracker.coverGainIfRowAdded(completedRow);
        if (score > bestScore) {
          bestScore = score;
          bestValueIndex = valueIndex;
        }
      }

      if (bestValueIndex === null) {
        return solver.completeRow(partial);
      }

      partial.set(parameterIndex, bestValueIndex);
    }

    return buildRowFromPartial(partial, model.parameters.length);
  };

  return {
    header,
    seedWarnings,
    nextRow() {
      if (seedRowIndex < seedRows.length) {
        const row = seedRows[seedRowIndex];
        seedRowIndex += 1;
        return [...row];
      }

      if (tracker.uncoveredTupleCount() === 0) {
        return null;
      }

      return chooseGeneratedRow();
    },
    acceptRow(valueIndices) {
      tracker.markRowCovered(valueIndices);
      generatedRowCount += 1;
    },
    coverage() {
      return {
        strength: tracker.strength,
        requiredTupleCount: tracker.requiredTupleCount,
        coveredTupleCount: tracker.coveredTupleCount(),
        uncoveredTupleCount: tracker.uncoveredTupleCount(),
      };
    },
    generatedRowCount() {
      return generatedRowCount;
    },
    toDisplayRow(valueIndices) {
      return valueIndices.map(
        (valueIndex, parameterIndex) =>
          model.parameters[parameterIndex].values[valueIndex].displayText,
      );
    },
  };
}

export async function generateSuiteStreaming(
  model: CanonicalModel,
  sink: RowSink,
  options: StreamingGeneratorOptions = {},
): Promise<StreamingGenerationResult> {
  const planner = createStreamingGenerationPlanner(model, options);
  const hooks = options.hooks;

  await sink.writeHeader(planner.header);

  try {
    for (;;) {
      const valueIndices = planner.nextRow();
      if (!valueIndices) {
        break;
      }

      await sink.writeRow(planner.toDisplayRow(valueIndices));
      planner.acceptRow(valueIndices);

      const coverage = planner.coverage();
      hooks?.onProgress?.(coverage.coveredTupleCount, coverage.requiredTupleCount);

      if (hooks?.shouldCancel?.()) {
        throw new CancelledError();
      }
    }
  } finally {
    await sink.close();
  }

  return {
    stats: {
      generatedRowCount: planner.generatedRowCount(),
      coverage: planner.coverage(),
    },
    seedWarnings: [...planner.seedWarnings],
  };
}
