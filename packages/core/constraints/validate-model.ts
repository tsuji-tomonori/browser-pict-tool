import type { Diagnostic } from "../diagnostics/types.ts";
import type {
  ComparisonPredicateNode,
  ConstraintDefinition,
  FunctionPredicateNode,
  ModelDocument,
  ParameterDataType,
  ParameterDefinition,
  PredicateNode,
  ValidatedParameterDefinition,
  ValidationResult,
} from "../model/types.ts";
import { SourceFile } from "../parser/source-file.ts";

type ParameterRegistryEntry = {
  parameter: ParameterDefinition;
  dataType: ParameterDataType;
};

function namesEqual(left: string, right: string, caseSensitive: boolean): boolean {
  return caseSensitive ? left === right : left.toUpperCase() === right.toUpperCase();
}

function inferParameterDataType(parameter: ParameterDefinition): ParameterDataType {
  for (const value of parameter.values) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value.primaryName)) {
      return "string";
    }
  }
  return "number";
}

function makeRegistry(
  parameters: ValidatedParameterDefinition[],
  caseSensitive: boolean,
): Map<string, ParameterRegistryEntry> {
  const registry = new Map<string, ParameterRegistryEntry>();
  for (const parameter of parameters) {
    const key = caseSensitive ? parameter.name : parameter.name.toUpperCase();
    registry.set(key, {
      parameter,
      dataType: parameter.dataType,
    });
  }
  return registry;
}

function lookupParameter(
  registry: Map<string, ParameterRegistryEntry>,
  name: string,
  caseSensitive: boolean,
): ParameterRegistryEntry | undefined {
  const key = caseSensitive ? name : name.toUpperCase();
  return registry.get(key);
}

function collectUnknownParameterName(
  predicate: PredicateNode,
  registry: Map<string, ParameterRegistryEntry>,
  caseSensitive: boolean,
): string | null {
  switch (predicate.kind) {
    case "comparison": {
      if (!lookupParameter(registry, predicate.left.name, caseSensitive)) {
        return predicate.left.name;
      }

      if (predicate.right.kind === "parameter_reference") {
        if (!lookupParameter(registry, predicate.right.name, caseSensitive)) {
          return predicate.right.name;
        }
      }

      return null;
    }
    case "function": {
      if (!predicate.parameterName) {
        return null;
      }
      return lookupParameter(registry, predicate.parameterName, caseSensitive)
        ? null
        : predicate.parameterName;
    }
    case "not":
      return collectUnknownParameterName(predicate.operand, registry, caseSensitive);
    case "logical":
      return (
        collectUnknownParameterName(predicate.left, registry, caseSensitive) ??
        collectUnknownParameterName(predicate.right, registry, caseSensitive)
      );
  }
}

function validateComparisonNode(
  sourceFile: SourceFile,
  diagnostics: Diagnostic[],
  comparison: ComparisonPredicateNode,
  registry: Map<string, ParameterRegistryEntry>,
  caseSensitive: boolean,
): void {
  const left = lookupParameter(registry, comparison.left.name, caseSensitive);
  if (!left) {
    return;
  }

  if (comparison.operator === "LIKE" || comparison.operator === "NOT LIKE") {
    if (left.dataType === "number") {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.constraint.like_numeric_parameter",
          "error",
          "LIKE は numeric parameter には使えません",
          comparison.span,
        ),
      );
      return;
    }
  }

  if (comparison.right.kind === "parameter_reference") {
    const right = lookupParameter(registry, comparison.right.name, caseSensitive);
    if (!right) {
      return;
    }

    if (namesEqual(left.parameter.name, right.parameter.name, caseSensitive)) {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.constraint.parameter_self_compare",
          "error",
          "parameter を自分自身と比較してはいけません",
          comparison.span,
        ),
      );
      return;
    }

    if (left.dataType !== right.dataType) {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.constraint.parameter_type_mismatch",
          "error",
          "型の異なる parameter 同士は比較できません",
          comparison.span,
        ),
      );
    }
    return;
  }

  if (comparison.right.kind === "value_set") {
    for (const value of comparison.right.values) {
      const valueType = value.kind === "number_literal" ? "number" : "string";
      if (valueType !== left.dataType) {
        diagnostics.push(
          sourceFile.createDiagnostic(
            "validation.constraint.valueset_type_mismatch",
            "error",
            "値集合の型が parameter と一致しません",
            comparison.span,
          ),
        );
        return;
      }
    }
    return;
  }

  const valueType = comparison.right.kind === "number_literal" ? "number" : "string";
  if (comparison.operator === "LIKE" || comparison.operator === "NOT LIKE") {
    if (valueType !== "string") {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.constraint.like_numeric_value",
          "error",
          "LIKE の右辺には文字列が必要です",
          comparison.span,
        ),
      );
      return;
    }
  }

  if (valueType !== left.dataType) {
    diagnostics.push(
      sourceFile.createDiagnostic(
        "validation.constraint.value_type_mismatch",
        "error",
        "parameter と値の型が一致しません",
        comparison.span,
      ),
    );
  }
}

function validateFunctionNode(
  sourceFile: SourceFile,
  diagnostics: Diagnostic[],
  fn: FunctionPredicateNode,
  registry: Map<string, ParameterRegistryEntry>,
  caseSensitive: boolean,
): void {
  if (!fn.parameterName) {
    return;
  }

  if (!lookupParameter(registry, fn.parameterName, caseSensitive)) {
    diagnostics.push(
      sourceFile.createDiagnostic(
        "validation.constraint.unknown_parameter",
        "warning",
        `未知の parameter '${fn.parameterName}' を含む constraint をスキップします`,
        fn.parameterNameSpan ?? fn.span,
      ),
    );
  }
}

function validatePredicate(
  sourceFile: SourceFile,
  diagnostics: Diagnostic[],
  predicate: PredicateNode,
  registry: Map<string, ParameterRegistryEntry>,
  caseSensitive: boolean,
): void {
  switch (predicate.kind) {
    case "comparison":
      validateComparisonNode(sourceFile, diagnostics, predicate, registry, caseSensitive);
      break;
    case "function":
      validateFunctionNode(sourceFile, diagnostics, predicate, registry, caseSensitive);
      break;
    case "not":
      validatePredicate(sourceFile, diagnostics, predicate.operand, registry, caseSensitive);
      break;
    case "logical":
      validatePredicate(sourceFile, diagnostics, predicate.left, registry, caseSensitive);
      validatePredicate(sourceFile, diagnostics, predicate.right, registry, caseSensitive);
      break;
  }
}

export function validateModelDocument(model: ModelDocument): ValidationResult {
  const sourceFile = new SourceFile(model.source);
  const diagnostics: Diagnostic[] = [];
  const parameters: ValidatedParameterDefinition[] = model.parameters.map((parameter) => ({
    ...parameter,
    dataType: inferParameterDataType(parameter),
  }));

  for (let leftIndex = 0; leftIndex < parameters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < parameters.length; rightIndex += 1) {
      if (
        namesEqual(
          parameters[leftIndex].name,
          parameters[rightIndex].name,
          model.options.caseSensitive,
        )
      ) {
        diagnostics.push(
          sourceFile.createDiagnostic(
            "validation.model.duplicate_parameter_name",
            "error",
            "parameter 名は一意である必要があります",
            {
              start: parameters[rightIndex].nameSpan.start,
              end: parameters[rightIndex].nameSpan.end,
            },
          ),
        );
      }
    }
  }

  for (const parameter of parameters) {
    if (parameter.values.length > 0 && parameter.values.every((value) => value.isNegative)) {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.model.parameter_all_negative",
          "error",
          "parameter は positive 値を少なくとも 1 つ持つ必要があります",
          parameter.span,
        ),
      );
    }
  }

  const registry = makeRegistry(parameters, model.options.caseSensitive);
  const effectiveConstraints: ConstraintDefinition[] = [];
  const droppedConstraints: ConstraintDefinition[] = [];

  for (const constraint of model.constraints) {
    const unknown =
      constraint.kind === "conditional"
        ? (collectUnknownParameterName(
            constraint.condition,
            registry,
            model.options.caseSensitive,
          ) ??
          collectUnknownParameterName(
            constraint.consequent,
            registry,
            model.options.caseSensitive,
          ) ??
          (constraint.alternative
            ? collectUnknownParameterName(
                constraint.alternative,
                registry,
                model.options.caseSensitive,
              )
            : null))
        : collectUnknownParameterName(constraint.predicate, registry, model.options.caseSensitive);

    if (unknown) {
      diagnostics.push(
        sourceFile.createDiagnostic(
          "validation.constraint.unknown_parameter",
          "warning",
          `未知の parameter '${unknown}' を含む constraint をスキップします`,
          constraint.span,
        ),
      );
      droppedConstraints.push(constraint);
      continue;
    }

    const beforeCount = diagnostics.length;
    if (constraint.kind === "conditional") {
      validatePredicate(
        sourceFile,
        diagnostics,
        constraint.condition,
        registry,
        model.options.caseSensitive,
      );
      validatePredicate(
        sourceFile,
        diagnostics,
        constraint.consequent,
        registry,
        model.options.caseSensitive,
      );
      if (constraint.alternative) {
        validatePredicate(
          sourceFile,
          diagnostics,
          constraint.alternative,
          registry,
          model.options.caseSensitive,
        );
      }
    } else {
      validatePredicate(
        sourceFile,
        diagnostics,
        constraint.predicate,
        registry,
        model.options.caseSensitive,
      );
    }

    const hasNewError = diagnostics
      .slice(beforeCount)
      .some((diagnostic) => diagnostic.severity === "error");
    if (hasNewError) {
      droppedConstraints.push(constraint);
      continue;
    }

    effectiveConstraints.push(constraint);
  }

  return {
    source: model.source,
    options: model.options,
    submodels: model.submodels,
    parameters,
    effectiveConstraints,
    droppedConstraints,
    diagnostics,
  };
}
