import {
  assignmentAllowsConstraints,
  createConstraintEvaluationContext,
  type ConstraintAssignment,
} from "../generator/constraint-evaluator.ts";
import type { CanonicalModel, CanonicalValue, CoverageSummary } from "../model/types.ts";

export type CoverageRowRecord = {
  values: string[];
  valueIndices: number[];
  sortKey: string;
  coverKeys: string[];
  selected?: boolean;
};

function chooseIndices(size: number, choose: number): number[][] {
  const results: number[][] = [];
  const current: number[] = [];

  const walk = (start: number): void => {
    if (current.length === choose) {
      results.push([...current]);
      return;
    }

    for (let index = start; index < size; index += 1) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return results;
}

function toCoverageRow(values: CanonicalValue[]): CoverageRowRecord {
  return {
    values: values.map((value) => value.displayText),
    valueIndices: values.map((value) => value.valueIndex),
    sortKey: values.map((value) => `${value.parameterId}:${value.valueIndex}`).join("\u0001"),
    coverKeys: [],
  };
}

function buildTupleUniverse(
  rows: CoverageRowRecord[],
  parameterSets: number[][],
): Set<string> {
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

function coerceRows(model: CanonicalModel, rows: ReadonlyArray<ReadonlyArray<string>>): CoverageRowRecord[] {
  const context = createConstraintEvaluationContext(model);
  const coerced: CoverageRowRecord[] = [];

  for (const row of rows) {
    if (row.length !== model.parameters.length) {
      continue;
    }

    const assignment: ConstraintAssignment = new Map();
    const canonicalValues: CanonicalValue[] = [];
    let negativeCount = 0;
    let resolvable = true;

    for (let index = 0; index < row.length; index += 1) {
      const parameter = model.parameters[index];
      const value = parameter.values.find((candidate) => candidate.displayText === row[index]);
      if (!value) {
        resolvable = false;
        break;
      }

      canonicalValues.push(value);
      assignment.set(parameter.id, value);
      negativeCount += value.isNegative ? 1 : 0;
    }

    if (
      !resolvable ||
      negativeCount > 1 ||
      !assignmentAllowsConstraints(model.constraints, assignment, context)
    ) {
      continue;
    }

    coerced.push(toCoverageRow(canonicalValues));
  }

  return coerced;
}

export function analyzeCoverage(
  model: CanonicalModel,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): CoverageSummary {
  const candidateRows = enumerateCandidateRows(model);
  const parameterSets = chooseIndices(model.parameters.length, model.options.strength);
  const tupleUniverse = buildTupleUniverse(candidateRows, parameterSets);
  const selectedRows = coerceRows(model, rows);
  const coveredTupleKeys = new Set<string>();

  for (const row of selectedRows) {
    row.coverKeys = parameterSets.map((parameterSet) =>
      parameterSet
        .map((parameterIndex) => `${parameterIndex}:${row.valueIndices[parameterIndex]}`)
        .join("|"),
    );

    for (const key of row.coverKeys) {
      if (tupleUniverse.has(key)) {
        coveredTupleKeys.add(key);
      }
    }
  }

  return {
    strength: model.options.strength,
    requiredTupleCount: tupleUniverse.size,
    coveredTupleCount: coveredTupleKeys.size,
    uncoveredTupleCount: tupleUniverse.size - coveredTupleKeys.size,
  };
}
