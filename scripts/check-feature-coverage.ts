#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type SupportPhase =
  | "required_v0_1"
  | "deferred_v0_2"
  | "deferred_v0_3"
  | "repo_extension_non_goal"
  | "reference_regression";

type UpstreamCoverageBucket =
  | "core_cli_parser"
  | "core_constraints"
  | "public_deferred_structure"
  | "public_deferred_generation"
  | "repo_extension_only"
  | "regression_corpus";

type CommandCase = {
  id: string;
  category: string;
  supportPhase: SupportPhase;
  featureTags: string[];
};

type UpstreamIndex = {
  generatedAt: string;
  sourceRoot: string;
  commands: CommandCase[];
};

type MaterializedSummary = {
  generatedAt: string;
  phases: SupportPhase[];
  fixtureCount: number;
  fixtures: Array<{
    id: string;
    supportPhase: SupportPhase;
  }>;
};

const supportPhaseBuckets: Record<SupportPhase, UpstreamCoverageBucket[]> = {
  required_v0_1: ["core_cli_parser", "core_constraints"],
  deferred_v0_2: ["public_deferred_structure"],
  deferred_v0_3: ["public_deferred_generation"],
  repo_extension_non_goal: ["repo_extension_only"],
  reference_regression: ["regression_corpus"],
};

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

function main() {
  const repoRoot = process.cwd();
  const indexPath = join(repoRoot, "tests", "generated", "upstream-index.json");
  const materializedPath = join(
    repoRoot,
    "tests",
    "generated",
    "materialized-fixtures-summary.json",
  );
  const reportPath = join(repoRoot, "tests", "generated", "feature-coverage.json");

  if (!existsSync(indexPath) || !existsSync(materializedPath)) {
    throw new Error("missing upstream-index.json or materialized-fixtures-summary.json");
  }

  const index = JSON.parse(readFileSync(indexPath, "utf8")) as UpstreamIndex;
  const materialized = JSON.parse(readFileSync(materializedPath, "utf8")) as MaterializedSummary;

  const materializedIds = new Set(materialized.fixtures.map((fixture) => fixture.id));
  const materializedByPhase = countBy(materialized.fixtures, (fixture) => fixture.supportPhase);
  const totalByPhase = countBy(index.commands, (commandCase) => commandCase.supportPhase);

  const phaseCoverage = Object.fromEntries(
    (Object.keys(supportPhaseBuckets) as SupportPhase[]).map((phase) => {
      const totalCases = totalByPhase[phase] ?? 0;
      const materializedCases = materializedByPhase[phase] ?? 0;
      return [
        phase,
        {
          buckets: supportPhaseBuckets[phase],
          totalCases,
          materializedCases,
          missingFixtureCases: totalCases - materializedCases,
          fullyMaterialized: totalCases > 0 && totalCases === materializedCases,
        },
      ];
    }),
  );

  const uncoveredCases = index.commands
    .filter((commandCase) => !materializedIds.has(commandCase.id))
    .map((commandCase) => ({
      id: commandCase.id,
      category: commandCase.category,
      supportPhase: commandCase.supportPhase,
      featureTags: commandCase.featureTags,
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      upstreamIndex: "tests/generated/upstream-index.json",
      materializedFixtures: "tests/generated/materialized-fixtures-summary.json",
    },
    summary: {
      totalCommandCases: index.commands.length,
      materializedFixtureCases: materialized.fixtures.length,
      missingFixtureCases: uncoveredCases.length,
    },
    phaseCoverage,
    uncoveredCases,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
