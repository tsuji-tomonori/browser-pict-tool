import type {
  CanonicalModel,
  CanonicalParameter,
  CanonicalScalar,
  CanonicalValue,
  ValidationResult,
} from "../model/types.ts";

function normalizeParameterId(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toUpperCase();
}

function normalizeScalar(value: string, dataType: CanonicalParameter["dataType"]): CanonicalScalar {
  return dataType === "number" ? Number(value) : value;
}

function toDisplayText(
  value: ValidationResult["parameters"][number]["values"][number],
  negativePrefix: string,
) {
  if (value.source === "reference") {
    return value.rawText;
  }

  return `${value.isNegative ? negativePrefix : ""}${value.primaryName}`;
}

export function normalizeValidatedModel(
  validation: ValidationResult,
  strength: number,
): CanonicalModel {
  const parameters: CanonicalParameter[] = validation.parameters.map(
    (parameter, parameterIndex) => {
      const parameterId = `${normalizeParameterId(
        parameter.name,
        validation.options.caseSensitive,
      )}#${parameterIndex}`;
      const values: CanonicalValue[] = parameter.values.map((value, valueIndex) => ({
        id: `${parameterId}:${valueIndex}`,
        span: value.span,
        parameterId,
        parameterName: parameter.name,
        valueIndex,
        rawText: value.rawText,
        displayText: toDisplayText(value, validation.options.negativePrefix),
        names: [...value.names],
        primaryName: value.primaryName,
        aliases: [...value.aliases],
        normalized: normalizeScalar(value.primaryName, parameter.dataType),
        isNegative: value.isNegative,
        weight: value.weight,
        explicitWeight: value.explicitWeight,
        source: value.source,
        referenceTarget: value.referenceTarget,
      }));

      return {
        id: parameterId,
        span: parameter.span,
        nameSpan: parameter.nameSpan,
        name: parameter.name,
        displayName: parameter.name,
        dataType: parameter.dataType,
        values,
        positiveValueIndices: values
          .map((value, index) => ({ value, index }))
          .filter(({ value }) => !value.isNegative)
          .map(({ index }) => index),
        negativeValueIndices: values
          .map((value, index) => ({ value, index }))
          .filter(({ value }) => value.isNegative)
          .map(({ index }) => index),
      };
    },
  );

  return {
    source: validation.source,
    options: {
      strength,
      caseSensitive: validation.options.caseSensitive,
      negativePrefix: validation.options.negativePrefix,
    },
    parameters,
    constraints: validation.effectiveConstraints,
    submodels: validation.submodels,
  };
}
