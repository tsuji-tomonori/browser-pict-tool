import type { CanonicalModel, SubmodelDefinition } from "../model/types.ts";

export type RelationTuple = {
  relationId: number;
  subset: readonly number[];
  valueIndices: readonly number[];
};

type RelationDefinition = {
  relationId: number;
  parameterIndices: readonly number[];
  strength: number;
};

function normalizeName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toUpperCase();
}

function resolveParameterIndices(
  model: CanonicalModel,
  submodel: SubmodelDefinition,
): readonly number[] {
  const parameterIndexByName = new Map<string, number>();

  for (let index = 0; index < model.parameters.length; index += 1) {
    parameterIndexByName.set(
      normalizeName(model.parameters[index]?.name ?? "", model.options.caseSensitive),
      index,
    );
  }

  const indices: number[] = [];

  for (const parameterName of submodel.parameterNames) {
    const parameterIndex = parameterIndexByName.get(
      normalizeName(parameterName, model.options.caseSensitive),
    );

    if (parameterIndex !== undefined) {
      indices.push(parameterIndex);
    }
  }

  return indices;
}

function* iterateSubsets(
  parameterIndices: readonly number[],
  choose: number,
  start = 0,
  current: number[] = [],
): Generator<readonly number[], void, void> {
  if (choose <= 0 || choose > parameterIndices.length) {
    return;
  }

  if (current.length === choose) {
    yield [...current];
    return;
  }

  for (
    let index = start;
    index <= parameterIndices.length - (choose - current.length);
    index += 1
  ) {
    current.push(parameterIndices[index] as number);
    yield* iterateSubsets(parameterIndices, choose, index + 1, current);
    current.pop();
  }
}

function* iterateValueIndices(
  model: CanonicalModel,
  subset: readonly number[],
  depth = 0,
  current: number[] = [],
): Generator<readonly number[], void, void> {
  if (depth === subset.length) {
    yield [...current];
    return;
  }

  const parameterIndex = subset[depth];
  const parameter = model.parameters[parameterIndex];

  if (!parameter) {
    return;
  }

  for (let valueIndex = 0; valueIndex < parameter.values.length; valueIndex += 1) {
    current.push(valueIndex);
    yield* iterateValueIndices(model, subset, depth + 1, current);
    current.pop();
  }
}

function buildRelations(model: CanonicalModel, strength: number): RelationDefinition[] {
  const relations: RelationDefinition[] = [
    {
      relationId: 0,
      parameterIndices: model.parameters.map((_parameter, index) => index),
      strength,
    },
  ];

  for (let index = 0; index < model.submodels.length; index += 1) {
    const submodel = model.submodels[index];
    relations.push({
      relationId: index + 1,
      parameterIndices: resolveParameterIndices(model, submodel),
      strength: submodel.order ?? strength,
    });
  }

  return relations;
}

export function* iterateTuples(
  model: CanonicalModel,
  strength: number,
): Generator<RelationTuple, void, void> {
  for (const relation of buildRelations(model, strength)) {
    for (const subset of iterateSubsets(relation.parameterIndices, relation.strength)) {
      for (const valueIndices of iterateValueIndices(model, subset)) {
        yield {
          relationId: relation.relationId,
          subset,
          valueIndices,
        };
      }
    }
  }
}
