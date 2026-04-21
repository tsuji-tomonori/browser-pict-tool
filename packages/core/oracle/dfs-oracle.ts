import type {
  CanonicalModel,
  CanonicalValue,
  ConstraintDefinition,
  PredicateNode,
} from "../model/types.ts";
import {
  assignmentAllowsConstraints,
  createConstraintEvaluationContext,
  type ConstraintAssignment,
} from "../generator/constraint-evaluator.ts";
import type { ValidityOracle } from "./validity-oracle.ts";

const DEFAULT_FAILURE_MEMO_SIZE = 65_536;

function normalizePartialKey(partial: ReadonlyMap<number, number>, parameterCount: number): string {
  let key = "";

  for (let parameterIndex = 0; parameterIndex < parameterCount; parameterIndex += 1) {
    const valueIndex = partial.get(parameterIndex);
    if (valueIndex === undefined) {
      continue;
    }

    key +=
      key.length === 0 ? `${parameterIndex}:${valueIndex}` : `|${parameterIndex}:${valueIndex}`;
  }

  return key;
}

function firstUnassignedParameterIndex(
  partial: ReadonlyMap<number, number>,
  parameterOrder: readonly number[],
): number {
  for (const parameterIndex of parameterOrder) {
    if (!partial.has(parameterIndex)) {
      return parameterIndex;
    }
  }

  return -1;
}

export function createDfsValidityOracle(model: CanonicalModel): ValidityOracle {
  const context = createConstraintEvaluationContext(model);
  const valueLookup = model.parameters.map((parameter) => parameter.values);
  const completionMemo = new Map<string, boolean>();
  const parameterOrder = model.parameters.map((_parameter, index) => index);
  const normalizeParameterName = (name: string): string =>
    model.options.caseSensitive ? name : name.toLocaleLowerCase();
  const parameterUsageCounts = new Array<number>(model.parameters.length).fill(0);
  const parameterIndexByName = new Map(
    model.parameters.map((parameter, index) => [normalizeParameterName(parameter.name), index]),
  );
  const countPredicateParameterUsage = (predicate: PredicateNode): void => {
    if (predicate.kind === "comparison") {
      const leftIndex = parameterIndexByName.get(normalizeParameterName(predicate.left.name));
      if (leftIndex !== undefined) {
        parameterUsageCounts[leftIndex] += 1;
      }

      if (predicate.right.kind === "parameter_reference") {
        const rightIndex = parameterIndexByName.get(normalizeParameterName(predicate.right.name));
        if (rightIndex !== undefined) {
          parameterUsageCounts[rightIndex] += 1;
        }
      }
      return;
    }

    if (predicate.kind === "function") {
      if (!predicate.parameterName) {
        return;
      }

      const parameterIndex = parameterIndexByName.get(
        normalizeParameterName(predicate.parameterName),
      );
      if (parameterIndex !== undefined) {
        parameterUsageCounts[parameterIndex] += 1;
      }
      return;
    }

    if (predicate.kind === "not") {
      countPredicateParameterUsage(predicate.operand);
      return;
    }

    countPredicateParameterUsage(predicate.left);
    countPredicateParameterUsage(predicate.right);
  };
  const countConstraintParameterUsage = (constraint: ConstraintDefinition): void => {
    if (constraint.kind === "invariant") {
      countPredicateParameterUsage(constraint.predicate);
      return;
    }

    countPredicateParameterUsage(constraint.condition);
    countPredicateParameterUsage(constraint.consequent);
    if (constraint.alternative) {
      countPredicateParameterUsage(constraint.alternative);
    }
  };

  for (const constraint of model.constraints) {
    countConstraintParameterUsage(constraint);
  }

  const searchOrder = [...parameterOrder].sort((left, right) => {
    const leftUsageCount = parameterUsageCounts[left] ?? 0;
    const rightUsageCount = parameterUsageCounts[right] ?? 0;
    if (leftUsageCount !== rightUsageCount) {
      return rightUsageCount - leftUsageCount;
    }

    const leftValueCount = model.parameters[left]?.values.length ?? 0;
    const rightValueCount = model.parameters[right]?.values.length ?? 0;
    if (leftValueCount !== rightValueCount) {
      return leftValueCount - rightValueCount;
    }
    return left - right;
  });
  let memoHits = 0;
  let memoMisses = 0;

  const getValue = (parameterIndex: number, valueIndex: number): CanonicalValue | null => {
    const parameterValues = valueLookup[parameterIndex];
    if (!parameterValues) {
      return null;
    }

    return parameterValues[valueIndex] ?? null;
  };

  const touchMemo = (key: string): boolean | null => {
    const memoized = completionMemo.get(key);
    if (memoized === undefined) {
      memoMisses += 1;
      return null;
    }

    completionMemo.delete(key);
    completionMemo.set(key, memoized);
    memoHits += 1;
    return memoized;
  };

  const rememberCompletion = (key: string, canComplete: boolean): void => {
    if (completionMemo.has(key)) {
      completionMemo.delete(key);
    }

    completionMemo.set(key, canComplete);
    if (completionMemo.size <= DEFAULT_FAILURE_MEMO_SIZE) {
      return;
    }

    const oldestKey = completionMemo.keys().next().value;
    if (oldestKey !== undefined) {
      completionMemo.delete(oldestKey);
    }
  };

  const toConstraintAssignment = (
    partial: ReadonlyMap<number, number>,
  ): { assignment: ConstraintAssignment; negativeCount: number } | null => {
    const assignment: ConstraintAssignment = new Map();
    let negativeCount = 0;

    for (const [parameterIndex, valueIndex] of partial.entries()) {
      const parameter = model.parameters[parameterIndex];
      const value = getValue(parameterIndex, valueIndex);
      if (!parameter || !value) {
        return null;
      }

      negativeCount += value.isNegative ? 1 : 0;
      if (negativeCount > 1) {
        return null;
      }

      assignment.set(parameter.id, value);
    }

    if (!assignmentAllowsConstraints(model.constraints, assignment, context)) {
      return null;
    }

    return { assignment, negativeCount };
  };

  const canCompleteInternal = (partial: Map<number, number>): boolean => {
    const key = normalizePartialKey(partial, model.parameters.length);
    const memoized = touchMemo(key);
    if (memoized !== null) {
      return memoized;
    }

    const assignment = toConstraintAssignment(partial);
    if (!assignment) {
      rememberCompletion(key, false);
      return false;
    }

    const parameterIndex = firstUnassignedParameterIndex(partial, searchOrder);
    if (parameterIndex === -1) {
      rememberCompletion(key, true);
      return true;
    }

    for (const value of model.parameters[parameterIndex].values) {
      if (value.isNegative && assignment.negativeCount > 0) {
        continue;
      }

      partial.set(parameterIndex, value.valueIndex);
      if (canCompleteInternal(partial)) {
        partial.delete(parameterIndex);
        rememberCompletion(key, true);
        return true;
      }
      partial.delete(parameterIndex);
    }

    rememberCompletion(key, false);
    return false;
  };

  const feasibleValuesInternal = (
    partial: Map<number, number>,
    parameterIndex: number,
  ): number[] => {
    const assignment = toConstraintAssignment(partial);
    if (!assignment) {
      rememberCompletion(normalizePartialKey(partial, model.parameters.length), false);
      return [];
    }

    const assignedValueIndex = partial.get(parameterIndex);
    if (assignedValueIndex !== undefined) {
      return canCompleteInternal(partial) ? [assignedValueIndex] : [];
    }

    const parameter = model.parameters[parameterIndex];
    if (!parameter) {
      return [];
    }

    const feasible: number[] = [];
    for (const value of parameter.values) {
      if (value.isNegative && assignment.negativeCount > 0) {
        continue;
      }

      partial.set(parameterIndex, value.valueIndex);
      if (canCompleteInternal(partial)) {
        feasible.push(value.valueIndex);
      }
      partial.delete(parameterIndex);
    }

    return feasible;
  };

  const completeRowInternal = (partial: Map<number, number>): number[] | null => {
    if (!canCompleteInternal(partial)) {
      return null;
    }

    const current = new Map(partial);

    const walk = (): number[] | null => {
      const parameterIndex = firstUnassignedParameterIndex(current, parameterOrder);
      if (parameterIndex === -1) {
        const row: number[] = [];
        for (let index = 0; index < model.parameters.length; index += 1) {
          const valueIndex = current.get(index);
          if (valueIndex === undefined) {
            return null;
          }
          row.push(valueIndex);
        }
        return row;
      }

      for (const valueIndex of feasibleValuesInternal(current, parameterIndex)) {
        current.set(parameterIndex, valueIndex);
        const completed = walk();
        if (completed) {
          return completed;
        }
        current.delete(parameterIndex);
      }

      return null;
    };

    return walk();
  };

  return {
    canComplete(partial) {
      return canCompleteInternal(new Map(partial));
    },
    feasibleValues(partial, parameterIndex) {
      return feasibleValuesInternal(new Map(partial), parameterIndex);
    },
    completeRow(partial) {
      return completeRowInternal(new Map(partial));
    },
    stats() {
      return {
        memoHits,
        memoMisses,
        memoSize: completionMemo.size,
      };
    },
  };
}
