#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type Badge = {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
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

function makeFractionMessage(materializedCases: number, totalCases: number): string {
  return `${materializedCases}/${totalCases}`;
}

function makeCoverageColor(materializedCases: number, totalCases: number): string {
  if (totalCases === 0) {
    return "lightgrey";
  }

  if (materializedCases === totalCases) {
    return "brightgreen";
  }

  const ratio = materializedCases / totalCases;
  if (ratio >= 0.8) {
    return "green";
  }
  if (ratio >= 0.5) {
    return "yellow";
  }
  if (ratio > 0) {
    return "orange";
  }
  return "lightgrey";
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
  const badgesRoot = join(repoRoot, "tests", "generated", "badges");

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
  mkdirSync(badgesRoot, { recursive: true });

  const featureBadge: Badge = {
    schemaVersion: 1,
    label: "feature coverage",
    message: makeFractionMessage(
      report.summary.materializedFixtureCases,
      report.summary.totalCommandCases,
    ),
    color: makeCoverageColor(
      report.summary.materializedFixtureCases,
      report.summary.totalCommandCases,
    ),
  };
  writeFileSync(
    join(badgesRoot, "feature-coverage.json"),
    JSON.stringify(featureBadge, null, 2) + "\n",
  );

  const requiredCoverage = report.phaseCoverage.required_v0_1;
  const requiredBadge: Badge = {
    schemaVersion: 1,
    label: "required v0.1",
    message: makeFractionMessage(requiredCoverage.materializedCases, requiredCoverage.totalCases),
    color: makeCoverageColor(requiredCoverage.materializedCases, requiredCoverage.totalCases),
  };
  writeFileSync(
    join(badgesRoot, "required-v0_1-coverage.json"),
    JSON.stringify(requiredBadge, null, 2) + "\n",
  );

  const deferredTotal =
    report.phaseCoverage.deferred_v0_2.totalCases +
    report.phaseCoverage.deferred_v0_3.totalCases +
    report.phaseCoverage.reference_regression.totalCases +
    report.phaseCoverage.repo_extension_non_goal.totalCases;
  const deferredMaterialized =
    report.phaseCoverage.deferred_v0_2.materializedCases +
    report.phaseCoverage.deferred_v0_3.materializedCases +
    report.phaseCoverage.reference_regression.materializedCases +
    report.phaseCoverage.repo_extension_non_goal.materializedCases;
  const deferredBadge: Badge = {
    schemaVersion: 1,
    label: "deferred coverage",
    message: makeFractionMessage(deferredMaterialized, deferredTotal),
    color: makeCoverageColor(deferredMaterialized, deferredTotal),
  };
  writeFileSync(
    join(badgesRoot, "deferred-coverage.json"),
    JSON.stringify(deferredBadge, null, 2) + "\n",
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
