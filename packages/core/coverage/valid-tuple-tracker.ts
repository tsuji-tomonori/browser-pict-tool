import type { CanonicalModel } from "../model/types.ts";
import { chooseIndices } from "./choose-indices.ts";

export type ParameterSubset = readonly number[];

export type UncoveredTuple = {
  subset: ParameterSubset;
  values: readonly number[];
};

export interface ValidTupleTracker {
  readonly strength: number;
  readonly requiredTupleCount: number;
  coveredTupleCount(): number;
  uncoveredTupleCount(): number;
  coverGainIfRowAdded(valueIndices: readonly number[]): number;
  markRowCovered(valueIndices: readonly number[]): void;
  pickUncoveredTuple(): UncoveredTuple | null;
  isTupleCovered(valueIndices: readonly number[], subset: ParameterSubset): boolean;
}

type SubsetTracker = {
  subset: number[];
  strides: number[];
  totalOrdinalCount: number;
  covered: Uint32Array;
  validOrdinals: Uint32Array;
};

function setBit(bitset: Uint32Array, bit: number): void {
  const wordIndex = bit >>> 5;
  const bitOffset = bit & 31;
  bitset[wordIndex] |= 1 << bitOffset;
}

function hasBit(bitset: Uint32Array, bit: number): boolean {
  const wordIndex = bit >>> 5;
  const bitOffset = bit & 31;
  return (bitset[wordIndex] & (1 << bitOffset)) !== 0;
}

function compareSubset(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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

function encodeSubsetOrdinal(values: readonly number[], strides: readonly number[]): number {
  let ordinal = 0;

  for (let index = 0; index < values.length; index += 1) {
    ordinal += values[index] * strides[index];
  }

  return ordinal;
}

function encodeRowOrdinal(
  valueIndices: readonly number[],
  subset: readonly number[],
  strides: readonly number[],
): number {
  let ordinal = 0;

  for (let index = 0; index < subset.length; index += 1) {
    ordinal += valueIndices[subset[index]] * strides[index];
  }

  return ordinal;
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

function hasValidOrdinal(validOrdinals: Uint32Array, ordinal: number): boolean {
  let low = 0;
  let high = validOrdinals.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = validOrdinals[middle];

    if (current === ordinal) {
      return true;
    }

    if (current < ordinal) {
      low = middle + 1;
      continue;
    }

    high = middle - 1;
  }

  return false;
}

function markPaddingBitsCovered(bitset: Uint32Array, totalOrdinalCount: number): void {
  const totalBitCount = bitset.length * 32;
  for (let bit = totalOrdinalCount; bit < totalBitCount; bit += 1) {
    setBit(bitset, bit);
  }
}

function createSubsetTracker(
  model: CanonicalModel,
  subset: number[],
  canComplete: (partial: Map<number, number>) => boolean,
): SubsetTracker {
  const strides = buildStrides(model, subset);
  const totalOrdinalCount = computeTotalOrdinalCount(model, subset);
  const covered = new Uint32Array(Math.ceil(totalOrdinalCount / 32));
  const validOrdinals: number[] = [];
  const currentValues = new Array<number>(subset.length).fill(0);

  markPaddingBitsCovered(covered, totalOrdinalCount);

  const walk = (depth: number): void => {
    if (depth === subset.length) {
      const partial = new Map<number, number>();
      for (let index = 0; index < subset.length; index += 1) {
        partial.set(subset[index], currentValues[index]);
      }

      const ordinal = encodeSubsetOrdinal(currentValues, strides);
      if (canComplete(partial)) {
        validOrdinals.push(ordinal);
        return;
      }

      setBit(covered, ordinal);
      return;
    }

    const parameter = model.parameters[subset[depth]];
    for (const value of parameter.values) {
      currentValues[depth] = value.valueIndex;
      walk(depth + 1);
    }
  };

  walk(0);

  return {
    subset,
    strides,
    totalOrdinalCount,
    covered,
    validOrdinals: Uint32Array.from(validOrdinals),
  };
}

export function createValidTupleTracker(
  model: CanonicalModel,
  canComplete: (partial: Map<number, number>) => boolean,
): ValidTupleTracker {
  const subsets = chooseIndices(model.parameters.length, model.options.strength).map((subset) =>
    createSubsetTracker(model, subset, canComplete),
  );
  const requiredTupleCount = subsets.reduce(
    (count, subset) => count + subset.validOrdinals.length,
    0,
  );
  let coveredTupleCount = 0;
  let cursorSubsetIndex = 0;
  let cursorOrdinal = 0;

  const findSubsetTracker = (subset: ParameterSubset): SubsetTracker | null => {
    for (const candidate of subsets) {
      if (compareSubset(candidate.subset, subset)) {
        return candidate;
      }
    }

    return null;
  };

  const markOrdinalCovered = (subset: SubsetTracker, ordinal: number): void => {
    if (!hasValidOrdinal(subset.validOrdinals, ordinal) || hasBit(subset.covered, ordinal)) {
      return;
    }

    setBit(subset.covered, ordinal);
    coveredTupleCount += 1;
  };

  const updateCursor = (subsetIndex: number, ordinal: number): void => {
    const subset = subsets[subsetIndex];
    if (ordinal + 1 < subset.totalOrdinalCount) {
      cursorSubsetIndex = subsetIndex;
      cursorOrdinal = ordinal + 1;
      return;
    }

    cursorSubsetIndex = subsets.length === 0 ? 0 : (subsetIndex + 1) % subsets.length;
    cursorOrdinal = 0;
  };

  const pickFromRange = (
    subsetIndex: number,
    start: number,
    end: number,
  ): UncoveredTuple | null => {
    const subset = subsets[subsetIndex];
    for (let ordinal = start; ordinal < end; ordinal += 1) {
      if (hasBit(subset.covered, ordinal)) {
        continue;
      }

      updateCursor(subsetIndex, ordinal);
      return {
        subset: subset.subset,
        values: decodeOrdinal(ordinal, subset.strides),
      };
    }

    return null;
  };

  return {
    strength: model.options.strength,
    requiredTupleCount,
    coveredTupleCount() {
      return coveredTupleCount;
    },
    uncoveredTupleCount() {
      return requiredTupleCount - coveredTupleCount;
    },
    coverGainIfRowAdded(valueIndices) {
      if (valueIndices.length !== model.parameters.length) {
        return 0;
      }

      let gain = 0;

      for (const subset of subsets) {
        const ordinal = encodeRowOrdinal(valueIndices, subset.subset, subset.strides);
        if (!hasValidOrdinal(subset.validOrdinals, ordinal) || hasBit(subset.covered, ordinal)) {
          continue;
        }

        gain += 1;
      }

      return gain;
    },
    markRowCovered(valueIndices) {
      for (const subset of subsets) {
        const ordinal = encodeRowOrdinal(valueIndices, subset.subset, subset.strides);
        markOrdinalCovered(subset, ordinal);
      }
    },
    pickUncoveredTuple() {
      if (requiredTupleCount === coveredTupleCount || subsets.length === 0) {
        return null;
      }

      for (let offset = 0; offset < subsets.length; offset += 1) {
        const subsetIndex = (cursorSubsetIndex + offset) % subsets.length;
        const start = offset === 0 ? cursorOrdinal : 0;
        const found = pickFromRange(subsetIndex, start, subsets[subsetIndex].totalOrdinalCount);
        if (found) {
          return found;
        }
      }

      if (cursorOrdinal > 0) {
        return pickFromRange(cursorSubsetIndex, 0, cursorOrdinal);
      }

      return null;
    },
    isTupleCovered(valueIndices, subset) {
      const subsetTracker = findSubsetTracker(subset);
      if (!subsetTracker || valueIndices.length !== subset.length) {
        return false;
      }

      const ordinal = encodeSubsetOrdinal(valueIndices, subsetTracker.strides);
      return (
        hasValidOrdinal(subsetTracker.validOrdinals, ordinal) &&
        hasBit(subsetTracker.covered, ordinal)
      );
    },
  };
}
