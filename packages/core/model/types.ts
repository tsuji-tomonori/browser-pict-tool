import type { Diagnostic, SourceSpan } from "../diagnostics/types.ts";

export type ParseOptions = {
  valueDelimiter?: string;
  aliasDelimiter?: string;
  negativePrefix?: string;
  caseSensitive?: boolean;
};

export type NormalizedParseOptions = {
  valueDelimiter: string;
  aliasDelimiter: string;
  negativePrefix: string;
  caseSensitive: boolean;
};

export type ParameterValueDefinition = {
  kind: "value";
  span: SourceSpan;
  rawText: string;
  names: string[];
  primaryName: string;
  aliases: string[];
  isNegative: boolean;
  weight: number;
  explicitWeight: boolean;
  source: "literal" | "reference";
  referenceTarget?: string;
};

export type ParameterDefinition = {
  kind: "parameter";
  span: SourceSpan;
  nameSpan: SourceSpan;
  name: string;
  separator: ":" | "delimiter";
  values: ParameterValueDefinition[];
  customOrder?: number;
  isResultParameter: boolean;
};

export type SubmodelDefinition = {
  kind: "submodel";
  span: SourceSpan;
  parameterNames: string[];
  order?: number;
  usedValueDelimiterFallback: boolean;
};

export type ParameterReferenceNode = {
  kind: "parameter_reference";
  span: SourceSpan;
  name: string;
};

export type LiteralNode =
  | {
      kind: "string_literal";
      span: SourceSpan;
      value: string;
    }
  | {
      kind: "number_literal";
      span: SourceSpan;
      value: number;
      raw: string;
    };

export type ValueSetNode = {
  kind: "value_set";
  span: SourceSpan;
  values: LiteralNode[];
};

export type ComparisonOperator =
  | "="
  | "<>"
  | ">"
  | ">="
  | "<"
  | "<="
  | "LIKE"
  | "NOT LIKE"
  | "IN"
  | "NOT IN";

export type ComparisonRightHandSide = LiteralNode | ParameterReferenceNode | ValueSetNode;

export type ComparisonPredicateNode = {
  kind: "comparison";
  span: SourceSpan;
  left: ParameterReferenceNode;
  operator: ComparisonOperator;
  right: ComparisonRightHandSide;
};

export type FunctionPredicateNode = {
  kind: "function";
  span: SourceSpan;
  functionName: "IsPositive" | "IsNegative";
  parameterName?: string;
  parameterNameSpan?: SourceSpan;
};

export type NotPredicateNode = {
  kind: "not";
  span: SourceSpan;
  operand: PredicateNode;
};

export type LogicalPredicateNode = {
  kind: "logical";
  span: SourceSpan;
  operator: "AND" | "OR";
  left: PredicateNode;
  right: PredicateNode;
};

export type PredicateNode =
  | ComparisonPredicateNode
  | FunctionPredicateNode
  | NotPredicateNode
  | LogicalPredicateNode;

export type ConstraintDefinition =
  | {
      kind: "conditional";
      span: SourceSpan;
      rawText: string;
      condition: PredicateNode;
      consequent: PredicateNode;
      alternative?: PredicateNode;
    }
  | {
      kind: "invariant";
      span: SourceSpan;
      rawText: string;
      predicate: PredicateNode;
    };

export type ModelDocument = {
  source: string;
  options: NormalizedParseOptions;
  parameters: ParameterDefinition[];
  submodels: SubmodelDefinition[];
  constraints: ConstraintDefinition[];
  rawConstraintText: string;
};

export type ParseModelResult = {
  model: ModelDocument;
  diagnostics: Diagnostic[];
};

export type ParameterDataType = "string" | "number";

export type ValidatedParameterDefinition = ParameterDefinition & {
  dataType: ParameterDataType;
};

export type ValidationResult = {
  parameters: ValidatedParameterDefinition[];
  effectiveConstraints: ConstraintDefinition[];
  droppedConstraints: ConstraintDefinition[];
  diagnostics: Diagnostic[];
};

export type GenerationStats = {
  strength: number;
  parameterCount: number;
  constraintCount: number;
  generatedRowCount: number;
  generationTimeMs: number;
  uncoveredTupleCount: number;
  candidateRowCount: number;
  requiredTupleCount: number;
};

export type GeneratedSuite = {
  header: string[];
  rows: string[][];
  stats: GenerationStats;
  warnings: Diagnostic[];
};

export type GenerateResult = {
  suite: GeneratedSuite | null;
  diagnostics: Diagnostic[];
};
