import type { CanonicalModel } from "../model/types.ts";
import type { ValidityOracle } from "../oracle/validity-oracle.ts";
import { chooseIndices } from "./choose-indices.ts";
import { createLazyCoverageStore } from "./lazy-coverage-store.ts";
import type { ValidTupleTracker } from "./valid-tuple-tracker.ts";

function buildStrides(model: CanonicalModel, subset: readonly number[]): number[] {
  const strides = new Array<number>(subset.length);
  let stride = 1;

  for (let index = subset.length - 1; index >= 0; index -= 1) {
    strides[index] = stride;
    stride *= model.parameters[subset[index]].values.length;
  }

  return strides;
}

function encodeValuesOrdinal(values: readonly number[], strides: readonly number[]): number {
  let ordinal = 0;

  for (let index = 0; index < values.length; index += 1) {
    ordinal += values[index] * strides[index];
  }

  return ordinal;
}

function encodeRowOrdinal(
  row: readonly number[],
  subset: readonly number[],
  strides: readonly number[],
): number {
  let ordinal = 0;

  for (let index = 0; index < subset.length; index += 1) {
    ordinal += row[subset[index]] * strides[index];
  }

  return ordinal;
}

function subsetKey(subset: readonly number[]): string {
  return subset.join("\u0001");
}

export function createLazyCoverageTracker(
  model: CanonicalModel,
  oracle: ValidityOracle,
): ValidTupleTracker {
  const stores = chooseIndices(model.parameters.length, model.options.strength).map((subset) => {
    const copy = [...subset];
    return {
      subset: copy,
      strides: buildStrides(model, copy),
      store: createLazyCoverageStore({
        model,
        subset: copy,
        oracle,
      }),
    };
  });
  const storesBySubset = new Map(stores.map((entry) => [subsetKey(entry.subset), entry]));
  let cursorIndex = 0;

  const coveredTupleCount = (): number =>
    stores.reduce((count, entry) => count + entry.store.coveredValidCount(), 0);

  const requiredTupleCount = (): number =>
    stores.reduce(
      (count, entry) =>
        count + entry.store.totalOrdinalCount - entry.store.discoveredInvalidCount(),
      0,
    );

  return {
    strength: model.options.strength,
    get requiredTupleCount() {
      return requiredTupleCount();
    },
    coveredTupleCount,
    uncoveredTupleCount() {
      return requiredTupleCount() - coveredTupleCount();
    },
    coverGainIfRowAdded(row) {
      if (row.length !== model.parameters.length) {
        return 0;
      }

      let gain = 0;

      for (const entry of stores) {
        const ordinal = encodeRowOrdinal(row, entry.subset, entry.strides);
        if (entry.store.isCovered(ordinal) || entry.store.isKnownInvalid(ordinal)) {
          continue;
        }

        gain += 1;
      }

      return gain;
    },
    markRowCovered(row) {
      if (row.length !== model.parameters.length) {
        return;
      }

      for (const entry of stores) {
        entry.store.markCovered(encodeRowOrdinal(row, entry.subset, entry.strides));
      }
    },
    pickUncoveredTuple() {
      if (stores.length === 0) {
        return null;
      }

      for (let offset = 0; offset < stores.length; offset += 1) {
        const index = (cursorIndex + offset) % stores.length;
        const picked = stores[index].store.pickUncovered();
        if (!picked) {
          continue;
        }

        cursorIndex = (index + 1) % stores.length;
        return {
          subset: stores[index].subset,
          values: picked.values,
        };
      }

      return null;
    },
    isTupleCovered(valueIndices, subset) {
      const entry = storesBySubset.get(subsetKey(subset));
      if (!entry || valueIndices.length !== subset.length) {
        return false;
      }

      return entry.store.isCovered(encodeValuesOrdinal(valueIndices, entry.strides));
    },
  };
}
