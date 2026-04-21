import {
  assignmentAllowsConstraints,
  createConstraintEvaluationContext,
  type ConstraintAssignment,
} from "../generator/constraint-evaluator.ts";
import type { CanonicalModel, CanonicalValue, CoverageSummary } from "../model/types.ts";
import { createDfsValidityOracle } from "../oracle/dfs-oracle.ts";
import { chooseIndices } from "./choose-indices.ts";
import { createValidTupleTracker } from "./valid-tuple-tracker.ts";

export type CoverageRowRecord = {
  values: string[];
  valueIndices: number[];
  sortKey: string;
  coverKeys: string[];
  selected?: boolean;
};

function toCoverageRow(values: CanonicalValue[]): CoverageRowRecord {
  return {
    values: values.map((value) => value.displayText),
    valueIndices: values.map((value) => value.valueIndex),
    sortKey: values.map((value) => `${value.parameterId}:${value.valueIndex}`).join("\u0001"),
    coverKeys: [],
  };
}

function buildTupleUniverse(rows: CoverageRowRecord[], parameterSets: number[][]): Set<string> {
  const tupleUniverse = new Set<string>();

  for (const row of rows) {
    row.coverKeys = parameterSets.map((parameterSet) => {
      const key = parameterSet
        .map((parameterIndex) => `${parameterIndex}:${row.valueIndices[parameterIndex]}`)
        .join("|");
      tupleUniverse.add(key);
      return key;
    });
  }

  return tupleUniverse;
}

export function enumerateCandidateRows(model: CanonicalModel): CoverageRowRecord[] {
  const context = createConstraintEvaluationContext(model);
  const assignment: ConstraintAssignment = new Map();
  const current: CanonicalValue[] = [];
  const rows: CoverageRowRecord[] = [];

  const walk = (depth: number, negativeCount: number): void => {
    if (depth === model.parameters.length) {
      rows.push(toCoverageRow(current));
      return;
    }

    const parameter = model.parameters[depth];
    for (const value of parameter.values) {
      if (value.isNegative && negativeCount > 0) {
        continue;
      }

      assignment.set(parameter.id, value);
      current.push(value);

      if (assignmentAllowsConstraints(model.constraints, assignment, context)) {
        walk(depth + 1, negativeCount + (value.isNegative ? 1 : 0));
      }

      current.pop();
      assignment.delete(parameter.id);
    }
  };

  walk(0, 0);
  return rows;
}

export function selectRowsForCoverage(
  model: CanonicalModel,
  candidateRows: CoverageRowRecord[],
  preSelectedRows?: CoverageRowRecord[],
): {
  selectedRows: CoverageRowRecord[];
  uncoveredTupleKeys: Set<string>;
  coverage: CoverageSummary;
} {
  const parameterSets = chooseIndices(model.parameters.length, model.options.strength);
  const tupleUniverse = buildTupleUniverse(candidateRows, parameterSets);
  const uncoveredTupleKeys = new Set(tupleUniverse);
  const selectedRows: CoverageRowRecord[] = [];

  for (const row of candidateRows) {
    row.selected = false;
  }

  for (const row of preSelectedRows ?? []) {
    if (row.selected) {
      continue;
    }

    row.selected = true;
    selectedRows.push(row);
    for (const key of row.coverKeys) {
      uncoveredTupleKeys.delete(key);
    }
  }

  while (uncoveredTupleKeys.size > 0) {
    let bestRow: CoverageRowRecord | null = null;
    let bestScore = -1;

    for (const row of candidateRows) {
      if (row.selected) {
        continue;
      }

      let score = 0;
      for (const key of row.coverKeys) {
        if (uncoveredTupleKeys.has(key)) {
          score += 1;
        }
      }

      if (!bestRow || score > bestScore) {
        bestRow = row;
        bestScore = score;
      }
    }

    if (!bestRow || bestScore <= 0) {
      break;
    }

    bestRow.selected = true;
    selectedRows.push(bestRow);
    for (const key of bestRow.coverKeys) {
      uncoveredTupleKeys.delete(key);
    }
  }

  return {
    selectedRows,
    uncoveredTupleKeys,
    coverage: {
      strength: model.options.strength,
      requiredTupleCount: tupleUniverse.size,
      coveredTupleCount: tupleUniverse.size - uncoveredTupleKeys.size,
      uncoveredTupleCount: uncoveredTupleKeys.size,
    },
  };
}

function coerceRowsToValueIndices(
  model: CanonicalModel,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): number[][] {
  const solver = createDfsValidityOracle(model);
  const coerced: number[][] = [];

  for (const row of rows) {
    if (row.length !== model.parameters.length) {
      continue;
    }

    const valueIndices: number[] = [];
    let resolvable = true;

    for (let index = 0; index < row.length; index += 1) {
      const parameter = model.parameters[index];
      const value = parameter.values.find((candidate) => candidate.displayText === row[index]);
      if (!value) {
        resolvable = false;
        break;
      }

      valueIndices.push(value.valueIndex);
    }

    if (!resolvable) {
      continue;
    }

    const assignment = new Map<number, number>(
      valueIndices.map((valueIndex, parameterIndex) => [parameterIndex, valueIndex]),
    );
    if (!solver.canComplete(assignment)) {
      continue;
    }

    coerced.push(valueIndices);
  }

  return coerced;
}

export function analyzeCoverage(
  model: CanonicalModel,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): CoverageSummary {
  const solver = createDfsValidityOracle(model);
  const tracker = createValidTupleTracker(model, solver.canComplete);
  const selectedRows = coerceRowsToValueIndices(model, rows);

  for (const valueIndices of selectedRows) {
    tracker.markRowCovered(valueIndices);
  }

  return {
    strength: model.options.strength,
    requiredTupleCount: tracker.requiredTupleCount,
    coveredTupleCount: tracker.coveredTupleCount(),
    uncoveredTupleCount: tracker.uncoveredTupleCount(),
  };
}
