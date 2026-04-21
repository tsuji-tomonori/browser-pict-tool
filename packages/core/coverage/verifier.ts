import {
  assignmentAllowsConstraints,
  createConstraintEvaluationContext,
  type ConstraintAssignment,
} from "../generator/constraint-evaluator.ts";
import { normalizeValidatedModel } from "../generator/normalize-model.ts";
import type {
  CanonicalModel,
  ConstraintDefinition,
  GeneratedSuite,
  PredicateNode,
  ValidationResult,
} from "../model/types.ts";
import { iterateTuples, type RelationTuple } from "./tuple-iterator.ts";

const FAILURE_MEMO_SIZE = 65_536;

export type VerifierIssue = {
  kind:
    | "constraint_violation_row"
    | "multiple_negative_values"
    | "uncovered_tuple"
    | "unresolvable_row";
  detail: string;
};

export type VerifierReport = {
  constraintViolatingRows: number;
  uncoveredTupleCount: number;
  excludedInvalidTupleCount: number;
  invalidTupleTargetedCount: number;
  rowsWithMultipleNegativeValues: number;
  submodelCoverage: Array<{
    relationId: number;
    required: number;
    covered: number;
    missing: number;
  }>;
  issues: VerifierIssue[];
};

type CompletionOracle = {
  canComplete(partial: Map<number, number>): boolean;
  isValidRow(valueIndices: readonly number[]): boolean;
};

type PreparedAssignment = {
  negativeCount: number;
};

function normalizeParameterName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toUpperCase();
}

function normalizePartialKey(partial: Map<number, number>, parameterCount: number): string {
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
  partial: Map<number, number>,
  parameterOrder: readonly number[],
): number {
  for (const parameterIndex of parameterOrder) {
    if (!partial.has(parameterIndex)) {
      return parameterIndex;
    }
  }

  return -1;
}

function countPredicateParameterUsage(
  predicate: PredicateNode,
  parameterIndexByName: Map<string, number>,
  parameterUsageCounts: number[],
  caseSensitive: boolean,
): void {
  if (predicate.kind === "comparison") {
    const leftIndex = parameterIndexByName.get(
      normalizeParameterName(predicate.left.name, caseSensitive),
    );

    if (leftIndex !== undefined) {
      parameterUsageCounts[leftIndex] += 1;
    }

    if (predicate.right.kind === "parameter_reference") {
      const rightIndex = parameterIndexByName.get(
        normalizeParameterName(predicate.right.name, caseSensitive),
      );

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
      normalizeParameterName(predicate.parameterName, caseSensitive),
    );

    if (parameterIndex !== undefined) {
      parameterUsageCounts[parameterIndex] += 1;
    }

    return;
  }

  if (predicate.kind === "not") {
    countPredicateParameterUsage(
      predicate.operand,
      parameterIndexByName,
      parameterUsageCounts,
      caseSensitive,
    );
    return;
  }

  countPredicateParameterUsage(
    predicate.left,
    parameterIndexByName,
    parameterUsageCounts,
    caseSensitive,
  );
  countPredicateParameterUsage(
    predicate.right,
    parameterIndexByName,
    parameterUsageCounts,
    caseSensitive,
  );
}

function buildSearchOrder(model: CanonicalModel): number[] {
  const parameterUsageCounts = new Array<number>(model.parameters.length).fill(0);
  const parameterIndexByName = new Map(
    model.parameters.map((parameter, index) => [
      normalizeParameterName(parameter.name, model.options.caseSensitive),
      index,
    ]),
  );

  const countConstraintParameterUsage = (constraint: ConstraintDefinition): void => {
    if (constraint.kind === "invariant") {
      countPredicateParameterUsage(
        constraint.predicate,
        parameterIndexByName,
        parameterUsageCounts,
        model.options.caseSensitive,
      );
      return;
    }

    countPredicateParameterUsage(
      constraint.condition,
      parameterIndexByName,
      parameterUsageCounts,
      model.options.caseSensitive,
    );
    countPredicateParameterUsage(
      constraint.consequent,
      parameterIndexByName,
      parameterUsageCounts,
      model.options.caseSensitive,
    );

    if (constraint.alternative) {
      countPredicateParameterUsage(
        constraint.alternative,
        parameterIndexByName,
        parameterUsageCounts,
        model.options.caseSensitive,
      );
    }
  };

  for (const constraint of model.constraints) {
    countConstraintParameterUsage(constraint);
  }

  return model.parameters
    .map((_parameter, index) => index)
    .sort((left, right) => {
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
}

function createCompletionOracle(model: CanonicalModel): CompletionOracle {
  const context = createConstraintEvaluationContext(model);
  const valueLookup = model.parameters.map((parameter) => parameter.values);
  const searchOrder = buildSearchOrder(model);
  const completionMemo = new Map<string, boolean>();

  const touchMemo = (key: string): boolean | null => {
    const memoized = completionMemo.get(key);

    if (memoized === undefined) {
      return null;
    }

    completionMemo.delete(key);
    completionMemo.set(key, memoized);

    return memoized;
  };

  const rememberCompletion = (key: string, canComplete: boolean): void => {
    if (completionMemo.has(key)) {
      completionMemo.delete(key);
    }

    completionMemo.set(key, canComplete);

    if (completionMemo.size <= FAILURE_MEMO_SIZE) {
      return;
    }

    const oldestKey = completionMemo.keys().next().value;

    if (oldestKey !== undefined) {
      completionMemo.delete(oldestKey);
    }
  };

  const prepareAssignment = (partial: Map<number, number>): PreparedAssignment | null => {
    const assignment: ConstraintAssignment = new Map();
    let negativeCount = 0;

    for (const [parameterIndex, valueIndex] of partial.entries()) {
      const parameter = model.parameters[parameterIndex];
      const value = valueLookup[parameterIndex]?.[valueIndex];

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

    return {
      negativeCount,
    };
  };

  const canCompleteInternal = (partial: Map<number, number>): boolean => {
    const key = normalizePartialKey(partial, model.parameters.length);
    const memoized = touchMemo(key);

    if (memoized !== null) {
      return memoized;
    }

    const prepared = prepareAssignment(partial);

    if (!prepared) {
      rememberCompletion(key, false);
      return false;
    }

    const parameterIndex = firstUnassignedParameterIndex(partial, searchOrder);

    if (parameterIndex === -1) {
      rememberCompletion(key, true);
      return true;
    }

    const parameter = model.parameters[parameterIndex];

    for (const value of parameter.values) {
      if (value.isNegative && prepared.negativeCount > 0) {
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

  return {
    canComplete(partial) {
      return canCompleteInternal(new Map(partial));
    },
    isValidRow(valueIndices) {
      if (valueIndices.length !== model.parameters.length) {
        return false;
      }

      const partial = new Map<number, number>();

      for (let parameterIndex = 0; parameterIndex < valueIndices.length; parameterIndex += 1) {
        partial.set(parameterIndex, valueIndices[parameterIndex] as number);
      }

      return prepareAssignment(partial) !== null;
    },
  };
}

function resolveRowValueIndices(
  model: CanonicalModel,
  row: readonly string[],
): readonly number[] | null {
  if (row.length !== model.parameters.length) {
    return null;
  }

  const valueIndices: number[] = [];

  for (let parameterIndex = 0; parameterIndex < row.length; parameterIndex += 1) {
    const parameter = model.parameters[parameterIndex];
    const valueIndex = parameter.values.findIndex(
      (candidate) => candidate.displayText === row[parameterIndex],
    );

    if (valueIndex < 0) {
      return null;
    }

    valueIndices.push(valueIndex);
  }

  return valueIndices;
}

function countNegativeValues(model: CanonicalModel, valueIndices: readonly number[]): number {
  let negativeCount = 0;

  for (let parameterIndex = 0; parameterIndex < valueIndices.length; parameterIndex += 1) {
    const value = model.parameters[parameterIndex]?.values[valueIndices[parameterIndex] as number];

    if (value?.isNegative) {
      negativeCount += 1;
    }
  }

  return negativeCount;
}

function rowCoversTuple(row: readonly number[], tuple: RelationTuple): boolean {
  for (let index = 0; index < tuple.subset.length; index += 1) {
    const parameterIndex = tuple.subset[index];

    if (row[parameterIndex] !== tuple.valueIndices[index]) {
      return false;
    }
  }

  return true;
}

function formatTuple(model: CanonicalModel, tuple: RelationTuple): string {
  return tuple.subset
    .map((parameterIndex, index) => {
      const parameter = model.parameters[parameterIndex];
      const value = parameter?.values[tuple.valueIndices[index] as number];

      return `${parameter?.name ?? `P${parameterIndex}`}=${value?.displayText ?? "?"}`;
    })
    .join(", ");
}

export function verifyGeneratedSuite(args: {
  validation: ValidationResult;
  strength: number;
  suite: GeneratedSuite;
}): VerifierReport {
  const model = normalizeValidatedModel(args.validation, args.strength);
  const oracle = createCompletionOracle(model);
  const validRows: number[][] = [];
  const issues: VerifierIssue[] = [];
  let constraintViolatingRows = 0;
  let rowsWithMultipleNegativeValues = 0;
  let uncoveredTupleCount = 0;
  let excludedInvalidTupleCount = 0;

  const pushIssue = (issue: VerifierIssue): void => {
    if (issues.length < 20) {
      issues.push(issue);
    }
  };

  for (let rowIndex = 0; rowIndex < args.suite.rows.length; rowIndex += 1) {
    const row = args.suite.rows[rowIndex] as readonly string[];
    const valueIndices = resolveRowValueIndices(model, row);

    if (!valueIndices) {
      constraintViolatingRows += 1;
      pushIssue({
        kind: "unresolvable_row",
        detail: `row ${rowIndex + 1} could not be resolved: ${row.join(", ")}`,
      });
      continue;
    }

    const negativeCount = countNegativeValues(model, valueIndices);

    if (negativeCount > 1) {
      rowsWithMultipleNegativeValues += 1;
      pushIssue({
        kind: "multiple_negative_values",
        detail: `row ${rowIndex + 1} has ${negativeCount} negative values: ${row.join(", ")}`,
      });
      continue;
    }

    if (!oracle.isValidRow(valueIndices)) {
      constraintViolatingRows += 1;
      pushIssue({
        kind: "constraint_violation_row",
        detail: `row ${rowIndex + 1} violates constraints: ${row.join(", ")}`,
      });
      continue;
    }

    validRows.push([...valueIndices]);
  }

  const relationCoverage = new Map<number, { required: number; covered: number }>();

  for (const tuple of iterateTuples(model, args.strength)) {
    const relation = relationCoverage.get(tuple.relationId) ?? { required: 0, covered: 0 };
    relationCoverage.set(tuple.relationId, relation);

    const partial = new Map<number, number>();

    for (let index = 0; index < tuple.subset.length; index += 1) {
      partial.set(tuple.subset[index] as number, tuple.valueIndices[index] as number);
    }

    if (!oracle.canComplete(partial)) {
      excludedInvalidTupleCount += 1;
      continue;
    }

    relation.required += 1;

    const covered = validRows.some((row) => rowCoversTuple(row, tuple));

    if (covered) {
      relation.covered += 1;
      continue;
    }

    uncoveredTupleCount += 1;
    pushIssue({
      kind: "uncovered_tuple",
      detail: `relation ${tuple.relationId} missing tuple: ${formatTuple(model, tuple)}`,
    });
  }

  const submodelCoverage = [...relationCoverage.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([relationId, coverage]) => ({
      relationId,
      required: coverage.required,
      covered: coverage.covered,
      missing: coverage.required - coverage.covered,
    }));

  return {
    constraintViolatingRows,
    uncoveredTupleCount,
    excludedInvalidTupleCount,
    invalidTupleTargetedCount: excludedInvalidTupleCount,
    rowsWithMultipleNegativeValues,
    submodelCoverage,
    issues,
  };
}
