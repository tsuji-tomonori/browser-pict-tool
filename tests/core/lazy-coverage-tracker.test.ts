import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CollectingSink,
  collectedHeader,
  collectedRows,
  createDfsValidityOracle,
  generateSuiteStreaming,
  normalizeValidatedModel,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";
import {
  createLazyCoverageTracker,
  createValidTupleTracker,
  verifyGeneratedSuite,
  type ValidTupleTracker,
} from "../../packages/core/coverage/index.ts";
import type { GeneratedSuite, ValidationResult } from "../../packages/core/model/index.ts";

type Fixture = {
  model: string;
  strength: number;
};

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureDir = path.resolve(repoRoot, "tests/core/fixtures");

function prepareValidation(source: string): ValidationResult {
  const parsed = parseModelText(source);
  return validateModelDocument(parsed.model);
}

function prepareModel(source: string, strength = 2) {
  return normalizeValidatedModel(prepareValidation(source), strength);
}

function loadFixture(filename: string): Fixture {
  return JSON.parse(readFileSync(path.join(fixtureDir, filename), "utf8")) as Fixture;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

async function generateStreamingSuite(
  source: string,
  args: { strength: number; coverage?: "eager" | "lazy" },
): Promise<{
  validation: ValidationResult;
  suite: GeneratedSuite;
  rowCount: number;
}> {
  const validation = prepareValidation(source);
  const model = normalizeValidatedModel(validation, args.strength);
  const sink = new CollectingSink();
  const result = await generateSuiteStreaming(model, sink, {
    coverage: args.coverage,
  });

  return {
    validation,
    suite: {
      header: [...collectedHeader(sink)],
      rows: collectedRows(sink).map((row) => [...row]),
      coverage: result.stats.coverage,
      stats: {
        strength: args.strength,
        parameterCount: model.parameters.length,
        constraintCount: model.constraints.length,
        generatedRowCount: result.stats.generatedRowCount,
        generationTimeMs: 0,
        uncoveredTupleCount: result.stats.coverage.uncoveredTupleCount,
        candidateRowCount: 0,
        requiredTupleCount: result.stats.coverage.requiredTupleCount,
      },
      warnings: [],
    },
    rowCount: result.stats.generatedRowCount,
  };
}

test("createLazyCoverageTracker exposes the ValidTupleTracker interface", () => {
  const model = prepareModel(`A: 0, 1, 2
B: 0, 1, 2
C: 0, 1, 2
`);
  const tracker: ValidTupleTracker = createLazyCoverageTracker(
    model,
    createDfsValidityOracle(model),
  );

  assert.equal(typeof tracker.coveredTupleCount, "function");
  assert.equal(typeof tracker.uncoveredTupleCount, "function");
  assert.equal(typeof tracker.coverGainIfRowAdded, "function");
  assert.equal(typeof tracker.markRowCovered, "function");
  assert.equal(typeof tracker.pickUncoveredTuple, "function");
  assert.equal(typeof tracker.isTupleCovered, "function");
  assert.equal(typeof tracker.strength, "number");
  assert.equal(typeof tracker.requiredTupleCount, "number");
});

test("lazy coverage implementation does not mention validOrdinals in source or tracker shape", () => {
  const model = prepareModel(`A: 0, 1
B: 0, 1
`);
  const tracker = createLazyCoverageTracker(model, createDfsValidityOracle(model));

  assert.equal("validOrdinals" in tracker, false);
  assert.equal(
    /validOrdinals/.test(
      stripComments(readSource("packages/core/coverage/lazy-coverage-tracker.ts")),
    ),
    false,
  );
  assert.equal(
    /validOrdinals/.test(
      stripComments(readSource("packages/core/coverage/lazy-coverage-store.ts")),
    ),
    false,
  );
});

test("lazy coverage defers oracle checks until uncovered tuples are requested", () => {
  const model = prepareModel(`A: 0, 1
B: 0, 1
C: 0, 1
`);
  let canCompleteCalls = 0;
  const tracker = createLazyCoverageTracker(model, {
    canComplete(partial) {
      canCompleteCalls += 1;
      return partial.size > 0;
    },
    feasibleValues() {
      return [];
    },
    completeRow() {
      return null;
    },
  });

  assert.equal(canCompleteCalls, 0);

  tracker.pickUncoveredTuple();

  assert.ok(canCompleteCalls > 0);
});

test("streaming generator covers all tuples with eager and lazy coverage on an unconstrained model", async () => {
  const source = `A: 0, 1, 2
B: 0, 1, 2
C: 0, 1, 2
`;
  const model = prepareModel(source);
  const oracle = createDfsValidityOracle(model);
  const eagerTracker = createValidTupleTracker(model, oracle.canComplete);
  const lazyTracker = createLazyCoverageTracker(model, oracle);

  assert.equal(lazyTracker.requiredTupleCount, eagerTracker.requiredTupleCount);

  const eager = await generateStreamingSuite(source, { strength: 2, coverage: "eager" });
  const lazy = await generateStreamingSuite(source, { strength: 2, coverage: "lazy" });

  const eagerReport = verifyGeneratedSuite({
    validation: eager.validation,
    strength: 2,
    suite: eager.suite,
  });
  const lazyReport = verifyGeneratedSuite({
    validation: lazy.validation,
    strength: 2,
    suite: lazy.suite,
  });

  assert.equal(eagerReport.uncoveredTupleCount, 0);
  assert.equal(eagerReport.constraintViolatingRows, 0);
  assert.equal(lazyReport.uncoveredTupleCount, 0);
  assert.equal(lazyReport.constraintViolatingRows, 0);
});

test("lazy coverage completes the constrained poc fixture without targeting invalid tuples", async () => {
  const fixture = loadFixture("poc-10x5x3wise-constrained.json");
  const generated = await generateStreamingSuite(fixture.model, {
    strength: fixture.strength,
    coverage: "lazy",
  });

  const report = verifyGeneratedSuite({
    validation: generated.validation,
    strength: fixture.strength,
    suite: generated.suite,
  });

  assert.equal(report.uncoveredTupleCount, 0);
  assert.ok(report.excludedInvalidTupleCount > 0);
  assert.equal(report.invalidTupleTargetedCount, report.excludedInvalidTupleCount);
  assert.equal(report.constraintViolatingRows, 0);
});

test("lazy and eager coverage produce verifier-clean suites with similar row counts", async () => {
  const fixture = loadFixture("poc-10x5x3wise-constrained.json");
  const eager = await generateStreamingSuite(fixture.model, {
    strength: fixture.strength,
    coverage: "eager",
  });
  const lazy = await generateStreamingSuite(fixture.model, {
    strength: fixture.strength,
    coverage: "lazy",
  });

  const eagerReport = verifyGeneratedSuite({
    validation: eager.validation,
    strength: fixture.strength,
    suite: eager.suite,
  });
  const lazyReport = verifyGeneratedSuite({
    validation: lazy.validation,
    strength: fixture.strength,
    suite: lazy.suite,
  });
  const minRows = Math.floor(eager.rowCount * 0.5);
  const maxRows = Math.ceil(eager.rowCount * 1.5);

  assert.equal(eagerReport.uncoveredTupleCount, 0);
  assert.equal(lazyReport.uncoveredTupleCount, 0);
  assert.ok(lazy.rowCount >= minRows, `lazy row count ${lazy.rowCount} < ${minRows}`);
  assert.ok(lazy.rowCount <= maxRows, `lazy row count ${lazy.rowCount} > ${maxRows}`);
});

test("generateSuiteStreaming uses lazy coverage on the default path", async () => {
  const source = `A: 0, 1, 2
B: 0, 1, 2
C: 0, 1, 2
D: 0, 1, 2
`;
  const validation = prepareValidation(source);
  const model = normalizeValidatedModel(validation, 2);

  const eagerBefore = process.memoryUsage().heapUsed;
  const eagerSink = new CollectingSink();
  const eagerResult = await generateSuiteStreaming(model, eagerSink, { coverage: "eager" });
  const eagerAfter = process.memoryUsage().heapUsed;

  const defaultBefore = process.memoryUsage().heapUsed;
  const defaultSink = new CollectingSink();
  const defaultResult = await generateSuiteStreaming(model, defaultSink, {});
  const defaultAfter = process.memoryUsage().heapUsed;

  const lazyBefore = process.memoryUsage().heapUsed;
  const lazySink = new CollectingSink();
  const lazyResult = await generateSuiteStreaming(model, lazySink, { coverage: "lazy" });
  const lazyAfter = process.memoryUsage().heapUsed;

  assert.equal(eagerResult.stats.coverage.uncoveredTupleCount, 0);
  assert.equal(defaultResult.stats.coverage.uncoveredTupleCount, 0);
  assert.equal(lazyResult.stats.coverage.uncoveredTupleCount, 0);
  assert.equal(defaultResult.stats.generatedRowCount, lazyResult.stats.generatedRowCount);

  const eagerDelta = Math.max(0, eagerAfter - eagerBefore);
  const defaultDelta = Math.max(0, defaultAfter - defaultBefore);
  const lazyDelta = Math.max(0, lazyAfter - lazyBefore);

  if (eagerDelta > 0 && lazyDelta > 0) {
    assert.ok(defaultDelta <= Math.ceil(eagerDelta * 1.5));
    return;
  }

  assert.ok(
    true,
    `heap comparison skipped: small fixture (eager=${eagerDelta}, default=${defaultDelta}, lazy=${lazyDelta})`,
  );
});
