import type {
  CanonicalModel,
  CanonicalParameter,
  CanonicalScalar,
  CanonicalValue,
  ComparisonPredicateNode,
  ConstraintDefinition,
  FunctionPredicateNode,
  LiteralNode,
  PredicateNode,
} from "../model/types.ts";

export const CONSTRAINT_TRUE = 1;
export const CONSTRAINT_FALSE = 0;
export const CONSTRAINT_UNKNOWN = -1;

export type ConstraintTruthValue =
  | typeof CONSTRAINT_TRUE
  | typeof CONSTRAINT_FALSE
  | typeof CONSTRAINT_UNKNOWN;

export type ConstraintAssignment = Map<string, CanonicalValue>;

export type ConstraintEvaluationContext = {
  model: CanonicalModel;
  parameterRegistry: Map<string, CanonicalParameter>;
};

function normalizeName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toUpperCase();
}

function namesEqual(left: string, right: string, caseSensitive: boolean): boolean {
  return normalizeName(left, caseSensitive) === normalizeName(right, caseSensitive);
}

function normalizeComparable(value: CanonicalScalar, caseSensitive: boolean): CanonicalScalar {
  if (typeof value === "string" && !caseSensitive) {
    return value.toUpperCase();
  }
  return value;
}

function patternToRegex(pattern: string, caseSensitive: boolean): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/%/g, ".*");

  return new RegExp(`^${escaped}$`, caseSensitive ? "" : "i");
}

function andTruth(left: ConstraintTruthValue, right: ConstraintTruthValue): ConstraintTruthValue {
  if (left === CONSTRAINT_FALSE || right === CONSTRAINT_FALSE) {
    return CONSTRAINT_FALSE;
  }
  if (left === CONSTRAINT_UNKNOWN || right === CONSTRAINT_UNKNOWN) {
    return CONSTRAINT_UNKNOWN;
  }
  return CONSTRAINT_TRUE;
}

function orTruth(left: ConstraintTruthValue, right: ConstraintTruthValue): ConstraintTruthValue {
  if (left === CONSTRAINT_TRUE || right === CONSTRAINT_TRUE) {
    return CONSTRAINT_TRUE;
  }
  if (left === CONSTRAINT_UNKNOWN || right === CONSTRAINT_UNKNOWN) {
    return CONSTRAINT_UNKNOWN;
  }
  return CONSTRAINT_FALSE;
}

function notTruth(value: ConstraintTruthValue): ConstraintTruthValue {
  if (value === CONSTRAINT_TRUE) {
    return CONSTRAINT_FALSE;
  }
  if (value === CONSTRAINT_FALSE) {
    return CONSTRAINT_TRUE;
  }
  return CONSTRAINT_UNKNOWN;
}

function literalToScalar(literal: LiteralNode): CanonicalScalar {
  return literal.kind === "number_literal" ? literal.value : literal.value;
}

function compareScalars(
  left: CanonicalScalar,
  right: CanonicalScalar,
  caseSensitive: boolean,
): number {
  const normalizedLeft = normalizeComparable(left, caseSensitive);
  const normalizedRight = normalizeComparable(right, caseSensitive);

  if (normalizedLeft === normalizedRight) {
    return 0;
  }

  return normalizedLeft < normalizedRight ? -1 : 1;
}

function matchesLiteral(
  value: CanonicalValue,
  literal: CanonicalScalar,
  parameter: CanonicalParameter,
  caseSensitive: boolean,
): boolean {
  if (parameter.dataType === "number") {
    return typeof literal === "number" && value.normalized === literal;
  }

  if (typeof literal !== "string") {
    return false;
  }

  return value.names.some((candidate) => namesEqual(candidate, literal, caseSensitive));
}

function lookupAssignedValue(
  parameterName: string,
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): { parameter: CanonicalParameter; value: CanonicalValue } | null {
  const parameter = context.parameterRegistry.get(
    normalizeName(parameterName, context.model.options.caseSensitive),
  );
  if (!parameter) {
    return null;
  }

  const value = assignment.get(parameter.id);
  if (!value) {
    return null;
  }

  return { parameter, value };
}

function evaluateComparison(
  comparison: ComparisonPredicateNode,
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): ConstraintTruthValue {
  const left = lookupAssignedValue(comparison.left.name, assignment, context);
  if (!left) {
    return CONSTRAINT_UNKNOWN;
  }

  if (comparison.operator === "IN" || comparison.operator === "NOT IN") {
    if (comparison.right.kind !== "value_set") {
      return CONSTRAINT_UNKNOWN;
    }

    const matched = comparison.right.values.some((value) =>
      matchesLiteral(
        left.value,
        literalToScalar(value),
        left.parameter,
        context.model.options.caseSensitive,
      ),
    );

    return comparison.operator === "IN"
      ? matched
        ? CONSTRAINT_TRUE
        : CONSTRAINT_FALSE
      : matched
        ? CONSTRAINT_FALSE
        : CONSTRAINT_TRUE;
  }

  if (comparison.operator === "LIKE" || comparison.operator === "NOT LIKE") {
    if (comparison.right.kind !== "string_literal") {
      return CONSTRAINT_UNKNOWN;
    }

    const regex = patternToRegex(comparison.right.value, context.model.options.caseSensitive);
    const matched = left.value.names.some((candidate) => regex.test(candidate));

    return comparison.operator === "LIKE"
      ? matched
        ? CONSTRAINT_TRUE
        : CONSTRAINT_FALSE
      : matched
        ? CONSTRAINT_FALSE
        : CONSTRAINT_TRUE;
  }

  if (comparison.right.kind === "parameter_reference") {
    const right = lookupAssignedValue(comparison.right.name, assignment, context);
    if (!right) {
      return CONSTRAINT_UNKNOWN;
    }

    const ordering = compareScalars(
      left.value.normalized,
      right.value.normalized,
      context.model.options.caseSensitive,
    );

    switch (comparison.operator) {
      case "=":
        return ordering === 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      case "<>":
        return ordering !== 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      case "<":
        return ordering < 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      case "<=":
        return ordering <= 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      case ">":
        return ordering > 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      case ">=":
        return ordering >= 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
      default:
        return CONSTRAINT_UNKNOWN;
    }
  }

  if (comparison.right.kind !== "string_literal" && comparison.right.kind !== "number_literal") {
    return CONSTRAINT_UNKNOWN;
  }

  const literal = literalToScalar(comparison.right);
  const ordering = compareScalars(
    left.value.normalized,
    literal,
    context.model.options.caseSensitive,
  );

  switch (comparison.operator) {
    case "=":
      return matchesLiteral(
        left.value,
        literal,
        left.parameter,
        context.model.options.caseSensitive,
      )
        ? CONSTRAINT_TRUE
        : CONSTRAINT_FALSE;
    case "<>":
      return matchesLiteral(
        left.value,
        literal,
        left.parameter,
        context.model.options.caseSensitive,
      )
        ? CONSTRAINT_FALSE
        : CONSTRAINT_TRUE;
    case "<":
      return ordering < 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
    case "<=":
      return ordering <= 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
    case ">":
      return ordering > 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
    case ">=":
      return ordering >= 0 ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
    default:
      return CONSTRAINT_UNKNOWN;
  }
}

function evaluateFunction(
  fn: FunctionPredicateNode,
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): ConstraintTruthValue {
  if (!fn.parameterName) {
    return CONSTRAINT_UNKNOWN;
  }

  const resolved = lookupAssignedValue(fn.parameterName, assignment, context);
  if (!resolved) {
    return CONSTRAINT_UNKNOWN;
  }

  if (fn.functionName === "IsNegative") {
    return resolved.value.isNegative ? CONSTRAINT_TRUE : CONSTRAINT_FALSE;
  }

  return resolved.value.isNegative ? CONSTRAINT_FALSE : CONSTRAINT_TRUE;
}

function evaluatePredicate(
  predicate: PredicateNode,
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): ConstraintTruthValue {
  switch (predicate.kind) {
    case "comparison":
      return evaluateComparison(predicate, assignment, context);
    case "function":
      return evaluateFunction(predicate, assignment, context);
    case "not":
      return notTruth(evaluatePredicate(predicate.operand, assignment, context));
    case "logical":
      return predicate.operator === "AND"
        ? andTruth(
            evaluatePredicate(predicate.left, assignment, context),
            evaluatePredicate(predicate.right, assignment, context),
          )
        : orTruth(
            evaluatePredicate(predicate.left, assignment, context),
            evaluatePredicate(predicate.right, assignment, context),
          );
  }
}

export function createConstraintEvaluationContext(
  model: CanonicalModel,
): ConstraintEvaluationContext {
  const parameterRegistry = new Map<string, CanonicalParameter>();

  for (const parameter of model.parameters) {
    parameterRegistry.set(normalizeName(parameter.name, model.options.caseSensitive), parameter);
  }

  return {
    model,
    parameterRegistry,
  };
}

export function evaluateConstraintDefinition(
  constraint: ConstraintDefinition,
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): ConstraintTruthValue {
  if (constraint.kind === "invariant") {
    return evaluatePredicate(constraint.predicate, assignment, context);
  }

  const whenValue = evaluatePredicate(constraint.condition, assignment, context);
  const thenValue = evaluatePredicate(constraint.consequent, assignment, context);
  const notWhen = notTruth(whenValue);

  if (!constraint.alternative) {
    return orTruth(notWhen, thenValue);
  }

  const elseValue = evaluatePredicate(constraint.alternative, assignment, context);
  return orTruth(andTruth(whenValue, thenValue), andTruth(notWhen, elseValue));
}

export function assignmentAllowsConstraints(
  constraints: ConstraintDefinition[],
  assignment: ConstraintAssignment,
  context: ConstraintEvaluationContext,
): boolean {
  return constraints.every(
    (constraint) =>
      evaluateConstraintDefinition(constraint, assignment, context) !== CONSTRAINT_FALSE,
  );
}
