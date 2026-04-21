import type { CanonicalModel } from "../model/types.ts";
import type { ValidityOracle } from "../oracle/validity-oracle.ts";
import { createChunkedBitset } from "./chunked-bitset.ts";

export interface LazyCoverageStore {
  readonly subset: readonly number[];
  readonly totalOrdinalCount: number;
  isCovered(ordinal: number): boolean;
  markCovered(ordinal: number): void;
  isKnownInvalid(ordinal: number): boolean;
  pickUncovered(): { ordinal: number; values: number[] } | null;
  coveredValidCount(): number;
  discoveredInvalidCount(): number;
}

function buildStrides(model: CanonicalModel, subset: readonly number[]): number[] {
  const strides = new Array<number>(subset.length);
  let stride = 1;

  for (let index = subset.length - 1; index >= 0; index -= 1) {
    strides[index] = stride;
    stride *= model.parameters[subset[index]].values.length;
  }

  return strides;
}

function computeTotalOrdinalCount(model: CanonicalModel, subset: readonly number[]): number {
  let total = 1;

  for (const parameterIndex of subset) {
    total *= model.parameters[parameterIndex].values.length;
  }

  return total;
}

function decodeOrdinal(ordinal: number, strides: readonly number[]): number[] {
  let remaining = ordinal;
  const values = new Array<number>(strides.length);

  for (let index = 0; index < strides.length; index += 1) {
    const stride = strides[index];
    values[index] = Math.floor(remaining / stride);
    remaining %= stride;
  }

  return values;
}

function toPartial(subset: readonly number[], values: readonly number[]): Map<number, number> {
  const partial = new Map<number, number>();

  for (let index = 0; index < subset.length; index += 1) {
    partial.set(subset[index], values[index]);
  }

  return partial;
}

export function createLazyCoverageStore(args: {
  model: CanonicalModel;
  subset: readonly number[];
  oracle: ValidityOracle;
}): LazyCoverageStore {
  const subset = [...args.subset];
  const strides = buildStrides(args.model, subset);
  const totalOrdinalCount = computeTotalOrdinalCount(args.model, subset);
  const covered = createChunkedBitset(totalOrdinalCount);
  const invalid = createChunkedBitset(totalOrdinalCount);
  let coveredCount = 0;
  let invalidCount = 0;
  let cursor = 0;
  let exhausted = totalOrdinalCount === 0;

  return {
    subset,
    totalOrdinalCount,
    isCovered(ordinal) {
      return covered.get(ordinal);
    },
    markCovered(ordinal) {
      if (invalid.get(ordinal) || covered.get(ordinal)) {
        return;
      }

      covered.set(ordinal);
      coveredCount += 1;
    },
    isKnownInvalid(ordinal) {
      return invalid.get(ordinal);
    },
    pickUncovered() {
      if (exhausted) {
        return null;
      }

      const start = cursor;

      do {
        const ordinal = cursor;
        cursor = (cursor + 1) % totalOrdinalCount;

        if (covered.get(ordinal) || invalid.get(ordinal)) {
          continue;
        }

        const values = decodeOrdinal(ordinal, strides);
        if (args.oracle.canComplete(toPartial(subset, values))) {
          return { ordinal, values };
        }

        invalid.set(ordinal);
        invalidCount += 1;
      } while (cursor !== start);

      exhausted = true;
      return null;
    },
    coveredValidCount() {
      return coveredCount;
    },
    discoveredInvalidCount() {
      return invalidCount;
    },
  };
}
