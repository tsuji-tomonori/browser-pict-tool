export {
  analyzeCoverage,
  enumerateCandidateRows,
  selectRowsForCoverage,
} from "./analyze-coverage.ts";
export { iterateTuples } from "./tuple-iterator.ts";
export { createValidTupleTracker } from "./valid-tuple-tracker.ts";
export { createLazyCoverageTracker } from "./lazy-coverage-tracker.ts";
export { verifyGeneratedSuite } from "./verifier.ts";

export type { CoverageRowRecord } from "./analyze-coverage.ts";
export type { RelationTuple } from "./tuple-iterator.ts";
export type { ParameterSubset, UncoveredTuple, ValidTupleTracker } from "./valid-tuple-tracker.ts";
export type { VerifierIssue, VerifierReport } from "./verifier.ts";
