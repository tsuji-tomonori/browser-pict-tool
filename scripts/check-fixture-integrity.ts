#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type ExpectedResult =
  | "SUCCESS"
  | "OUT_OF_MEMORY"
  | "GENERATION_ERROR"
  | "BAD_OPTION"
  | "BAD_MODEL"
  | "BAD_CONSTRAINTS"
  | "BAD_ROWSEED_FILE";

type SupportPhase =
  | "required_v0_1"
  | "deferred_v0_2"
  | "deferred_v0_3"
  | "repo_extension_non_goal"
  | "reference_regression";

type CommandCase = {
  id: string;
  category: string;
  raw: string;
  modelFile: string;
  optionsRaw: string[];
  expectedResult: ExpectedResult;
  expectedExitCode: number;
  notes: string[];
  featureTags: string[];
  supportPhase: SupportPhase;
  source: {
    testsPath: string;
    lineNumber: number;
  };
};

type UpstreamIndex = {
  generatedAt: string;
  sourceRoot: string;
  commands: CommandCase[];
};

type MaterializedSummary = {
  generatedAt: string;
  phases: SupportPhase[];
  cleanedCaseDirs?: number;
  fixtureCount: number;
  categoryCounts?: Record<string, number>;
  supportPhaseCounts?: Partial<Record<SupportPhase, number>>;
  fixtures: Array<{
    id: string;
    path: string;
    supportPhase: SupportPhase;
  }>;
};

type MaterializedManifest = {
  id: string;
  category: string;
  source: {
    modelPath: string | null;
    testsPath: string;
    lineNumber: number;
    command: string;
  };
  input: {
    modelPath: string | null;
    optionsRaw: string[];
    rowSeedPaths: string[];
  };
  expected: {
    upstreamResult: ExpectedResult;
    expectedExitCode: number;
    assertionMode: "semantic" | "diagnostic";
    notes: string[];
  };
  implementationStatus: SupportPhase;
  tags: string[];
};

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function listActualFixtureDirs(fixturesRoot: string): string[] {
  if (!existsSync(fixturesRoot)) {
    return [];
  }

  const entries: string[] = [];
  for (const category of readdirSync(fixturesRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }

    const categoryPath = join(fixturesRoot, category.name);
    for (const caseDir of readdirSync(categoryPath, { withFileTypes: true })) {
      if (!caseDir.isDirectory()) {
        continue;
      }

      entries.push(join(categoryPath, caseDir.name));
    }
  }

  return entries.sort();
}

function main() {
  const repoRoot = process.cwd();
  const indexPath = join(repoRoot, "tests", "generated", "upstream-index.json");
  const summaryPath = join(repoRoot, "tests", "generated", "materialized-fixtures-summary.json");
  const fixturesRoot = join(repoRoot, "tests", "fixtures", "upstream");

  const errors: string[] = [];

  if (!existsSync(indexPath)) {
    errors.push(`missing file: ${relative(repoRoot, indexPath)}`);
  }
  if (!existsSync(summaryPath)) {
    errors.push(`missing file: ${relative(repoRoot, summaryPath)}`);
  }
  if (errors.length > 0) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
    process.exit(1);
  }

  const index = readJsonFile<UpstreamIndex>(indexPath);
  const summary = readJsonFile<MaterializedSummary>(summaryPath);
  const expectedCases = index.commands.filter((commandCase) =>
    summary.phases.includes(commandCase.supportPhase),
  );
  const expectedById = new Map(expectedCases.map((commandCase) => [commandCase.id, commandCase]));
  const summaryById = new Map(summary.fixtures.map((fixture) => [fixture.id, fixture]));

  if (summary.fixtureCount !== summary.fixtures.length) {
    errors.push(
      `summary.fixtureCount=${summary.fixtureCount} but fixtures.length=${summary.fixtures.length}`,
    );
  }
  if (summary.fixtureCount !== expectedCases.length) {
    errors.push(
      `summary.fixtureCount=${summary.fixtureCount} but expected selected cases=${expectedCases.length}`,
    );
  }

  for (const expectedCase of expectedCases) {
    if (!summaryById.has(expectedCase.id)) {
      errors.push(`summary missing fixture id: ${expectedCase.id}`);
    }
  }
  for (const fixture of summary.fixtures) {
    if (!expectedById.has(fixture.id)) {
      errors.push(`summary contains unexpected fixture id: ${fixture.id}`);
    }
  }

  const expectedCategoryCounts = countBy(expectedCases, (commandCase) => commandCase.category);
  const expectedPhaseCounts = countBy(expectedCases, (commandCase) => commandCase.supportPhase);

  if (
    summary.categoryCounts &&
    JSON.stringify(summary.categoryCounts) !== JSON.stringify(expectedCategoryCounts)
  ) {
    errors.push("summary.categoryCounts does not match upstream-index selection");
  }
  if (
    summary.supportPhaseCounts &&
    JSON.stringify(summary.supportPhaseCounts) !== JSON.stringify(expectedPhaseCounts)
  ) {
    errors.push("summary.supportPhaseCounts does not match upstream-index selection");
  }

  const actualFixtureDirs = listActualFixtureDirs(fixturesRoot);
  const actualRelativeDirs = actualFixtureDirs.map((path) => relative(repoRoot, path));
  const expectedRelativeDirs = summary.fixtures.map((fixture) => fixture.path).sort();

  if (actualRelativeDirs.length !== summary.fixtureCount) {
    errors.push(
      `actual fixture directories=${actualRelativeDirs.length} but summary.fixtureCount=${summary.fixtureCount}`,
    );
  }

  const actualDirSet = new Set(actualRelativeDirs);
  const expectedDirSet = new Set(expectedRelativeDirs);

  for (const expectedPath of expectedRelativeDirs) {
    if (!actualDirSet.has(expectedPath)) {
      errors.push(`missing materialized fixture directory: ${expectedPath}`);
    }
  }
  for (const actualPath of actualRelativeDirs) {
    if (!expectedDirSet.has(actualPath)) {
      errors.push(`unexpected materialized fixture directory: ${actualPath}`);
    }
  }

  for (const fixture of summary.fixtures) {
    const fixtureDir = join(repoRoot, fixture.path);
    const manifestPath = join(fixtureDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      errors.push(`missing manifest: ${relative(repoRoot, manifestPath)}`);
      continue;
    }

    const manifest = readJsonFile<MaterializedManifest>(manifestPath);
    const expectedCase = expectedById.get(fixture.id);
    if (!expectedCase) {
      continue;
    }

    if (manifest.id !== fixture.id) {
      errors.push(`manifest id mismatch at ${fixture.path}: ${manifest.id}`);
    }
    if (manifest.category !== expectedCase.category) {
      errors.push(`manifest category mismatch at ${fixture.path}: ${manifest.category}`);
    }
    if (manifest.implementationStatus !== fixture.supportPhase) {
      errors.push(`manifest phase mismatch at ${fixture.path}: ${manifest.implementationStatus}`);
    }
    if (manifest.source.testsPath !== expectedCase.source.testsPath) {
      errors.push(
        `manifest source.testsPath mismatch at ${fixture.path}: ${manifest.source.testsPath}`,
      );
    }
    if (manifest.source.lineNumber !== expectedCase.source.lineNumber) {
      errors.push(
        `manifest source.lineNumber mismatch at ${fixture.path}: ${manifest.source.lineNumber}`,
      );
    }
    if (manifest.source.command !== expectedCase.raw) {
      errors.push(
        `manifest source.command mismatch at ${fixture.path}: ${manifest.source.command}`,
      );
    }
    if (JSON.stringify(manifest.input.optionsRaw) !== JSON.stringify(expectedCase.optionsRaw)) {
      errors.push(`manifest input.optionsRaw mismatch at ${fixture.path}`);
    }
    if (manifest.expected.upstreamResult !== expectedCase.expectedResult) {
      errors.push(
        `manifest expected.upstreamResult mismatch at ${fixture.path}: ${manifest.expected.upstreamResult}`,
      );
    }
    if (manifest.expected.expectedExitCode !== expectedCase.expectedExitCode) {
      errors.push(
        `manifest expected.expectedExitCode mismatch at ${fixture.path}: ${manifest.expected.expectedExitCode}`,
      );
    }

    const expectedModelPath = manifest.input.modelPath
      ? join(fixtureDir, manifest.input.modelPath)
      : null;
    if (manifest.input.modelPath && !existsSync(expectedModelPath)) {
      errors.push(`missing model file: ${relative(repoRoot, expectedModelPath)}`);
    }
    if (!manifest.input.modelPath && existsSync(join(fixtureDir, "model.pict"))) {
      errors.push(`unexpected model file for model-less fixture: ${fixture.path}/model.pict`);
    }

    for (const rowSeedPath of manifest.input.rowSeedPaths) {
      const seedPath = join(fixtureDir, rowSeedPath);
      if (!existsSync(seedPath)) {
        errors.push(`missing row seed file: ${relative(repoRoot, seedPath)}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ ok: false, errorCount: errors.length, errors }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phases: summary.phases,
        fixtureCount: summary.fixtureCount,
        categoryCounts: expectedCategoryCounts,
        supportPhaseCounts: expectedPhaseCounts,
      },
      null,
      2,
    ),
  );
}

main();
