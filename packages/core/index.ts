export { validateModelDocument } from "./constraints/index.ts";
export {
  analyzeCoverage,
  createValidTupleTracker,
  enumerateCandidateRows,
  selectRowsForCoverage,
} from "./coverage/index.ts";
export { hasErrorDiagnostics } from "./diagnostics/index.ts";
export {
  CollectingSink,
  CompositeSink,
  FileSink,
  PreviewSink,
  collectedHeader,
  collectedRows,
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  createTsvStreamEncoder,
  exportCsv,
  exportMarkdown,
  exportTsv,
  previewIsTruncated,
  previewRows,
} from "./exporters/index.ts";
export {
  CancelledError,
  createConstraintSolver,
  generateSuiteStreaming,
  generateTestSuite,
  normalizeValidatedModel,
} from "./generator/index.ts";
export { createDfsValidityOracle } from "./oracle/index.ts";
export { normalizeParseOptions, parseModelText } from "./parser/index.ts";

export type { ChunkWriter, RowSink, StreamEncoder } from "./exporters/index.ts";
export type {
  Diagnostic,
  DiagnosticSeverity,
  SourcePosition,
  SourceSpan,
} from "./diagnostics/index.ts";
export type { ConstraintSolver } from "./generator/index.ts";
export type { ValidityOracle } from "./oracle/index.ts";
export type {
  StreamingGenerationResult,
  StreamingGenerationStats,
  StreamingGeneratorHooks,
  StreamingGeneratorOptions,
  StreamingSeedWarning,
} from "./generator/index.ts";
export type {
  CanonicalModel,
  CanonicalParameter,
  CanonicalScalar,
  CanonicalValue,
  ComparisonOperator,
  ComparisonPredicateNode,
  ComparisonRightHandSide,
  ConstraintDefinition,
  CoverageSummary,
  FunctionPredicateNode,
  GenerateRequest,
  GenerateResult,
  GenerateStrength,
  GeneratedSuite,
  GenerationStats,
  LiteralNode,
  LogicalPredicateNode,
  ModelDocument,
  NormalizedParseOptions,
  NotPredicateNode,
  ParameterDataType,
  ParameterDefinition,
  ParameterReferenceNode,
  ParameterValueDefinition,
  ParseModelResult,
  ParseOptions,
  PredicateNode,
  SubmodelDefinition,
  ValidatedParameterDefinition,
  ValidationResult,
  ValueSetNode,
} from "./model/index.ts";
export type { ParameterSubset, UncoveredTuple, ValidTupleTracker } from "./coverage/index.ts";
