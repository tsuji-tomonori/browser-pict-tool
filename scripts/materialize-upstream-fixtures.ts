#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

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

function parseArgs(argv: string[]): SupportPhase[] {
  const phaseArg = argv.find((arg) => arg.startsWith("--phase="));
  if (!phaseArg) {
    return ["required_v0_1"];
  }

  return phaseArg
    .slice("--phase=".length)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as SupportPhase[];
}

function safeCaseSlug(id: string): string {
  return id.replaceAll(":", "-");
}

function cleanupPreviouslyMaterializedCases(fixturesRoot: string, commands: CommandCase[]): number {
  let removedCount = 0;

  for (const commandCase of commands) {
    const caseDir = join(fixturesRoot, commandCase.category, safeCaseSlug(commandCase.id));
    if (!existsSync(caseDir)) {
      continue;
    }

    rmSync(caseDir, { recursive: true, force: true });
    removedCount += 1;
  }

  return removedCount;
}

function resolveModelSource(
  repoRoot: string,
  sourceRoot: string,
  commandCase: CommandCase,
): string | null {
  if (commandCase.category === "root") {
    return null;
  }

  const categoryDir = join(repoRoot, sourceRoot, commandCase.category);
  const candidate = join(categoryDir, commandCase.modelFile);
  return existsSync(candidate) ? candidate : null;
}

function resolveSeedSources(
  repoRoot: string,
  sourceRoot: string,
  commandCase: CommandCase,
): string[] {
  const categoryDir =
    commandCase.category === "root"
      ? join(repoRoot, sourceRoot)
      : join(repoRoot, sourceRoot, commandCase.category);

  return commandCase.optionsRaw
    .map((option) => {
      const match = option.match(/^[/-][eE]:(.+)$/);
      if (!match) return null;

      const rawPath = match[1];
      if (!rawPath) return null;

      const normalized = rawPath.includes("%curdir%")
        ? rawPath.replace("%curdir%", `${categoryDir}/`)
        : join(categoryDir, rawPath);

      return existsSync(normalized) ? normalized : null;
    })
    .filter((item): item is string => item !== null);
}

function main() {
  const repoRoot = process.cwd();
  const sourceRoot = ".work/pict/test";
  const fixturesRoot = join(repoRoot, "tests", "fixtures", "upstream");
  const generatedIndexPath = join(repoRoot, "tests", "generated", "upstream-index.json");
  const phases = parseArgs(process.argv.slice(2));

  const index = JSON.parse(readFileSync(generatedIndexPath, "utf8")) as UpstreamIndex;
  const selectedCases = index.commands.filter((commandCase) =>
    phases.includes(commandCase.supportPhase),
  );
  const cleanedCaseDirs = cleanupPreviouslyMaterializedCases(fixturesRoot, index.commands);

  const materialized: Array<{ id: string; path: string; supportPhase: SupportPhase }> = [];
  const categoryCounts = new Map<string, number>();
  const phaseCounts = new Map<SupportPhase, number>();

  for (const commandCase of selectedCases) {
    const categoryDir = join(fixturesRoot, commandCase.category);
    const caseDir = join(categoryDir, safeCaseSlug(commandCase.id));

    mkdirSync(caseDir, { recursive: true });

    const modelSource = resolveModelSource(repoRoot, sourceRoot, commandCase);
    const modelTarget = modelSource ? join(caseDir, "model.pict") : null;
    if (modelSource && modelTarget) {
      copyFileSync(modelSource, modelTarget);
    }

    const seedSources = resolveSeedSources(repoRoot, sourceRoot, commandCase);
    const rowSeedPaths: string[] = [];
    seedSources.forEach((seedSource, index) => {
      const ext = basename(seedSource).includes(".")
        ? basename(seedSource).split(".").pop()
        : "sed";
      const targetName = `row-seed-${index + 1}.${ext}`;
      const targetPath = join(caseDir, targetName);
      copyFileSync(seedSource, targetPath);
      rowSeedPaths.push(targetName);
    });

    const manifest: MaterializedManifest = {
      id: commandCase.id,
      category: commandCase.category,
      source: {
        modelPath: modelSource ? relative(repoRoot, modelSource) : null,
        testsPath: commandCase.source.testsPath,
        lineNumber: commandCase.source.lineNumber,
        command: commandCase.raw,
      },
      input: {
        modelPath: modelTarget ? "model.pict" : null,
        optionsRaw: commandCase.optionsRaw,
        rowSeedPaths,
      },
      expected: {
        upstreamResult: commandCase.expectedResult,
        expectedExitCode: commandCase.expectedExitCode,
        assertionMode: commandCase.expectedResult === "SUCCESS" ? "semantic" : "diagnostic",
        notes: commandCase.notes,
      },
      implementationStatus: commandCase.supportPhase,
      tags: commandCase.featureTags,
    };

    writeFileSync(join(caseDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    materialized.push({
      id: commandCase.id,
      path: relative(repoRoot, caseDir),
      supportPhase: commandCase.supportPhase,
    });

    categoryCounts.set(commandCase.category, (categoryCounts.get(commandCase.category) ?? 0) + 1);
    phaseCounts.set(commandCase.supportPhase, (phaseCounts.get(commandCase.supportPhase) ?? 0) + 1);
  }

  const summaryPath = join(repoRoot, "tests", "generated", "materialized-fixtures-summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        phases,
        cleanedCaseDirs,
        fixtureCount: materialized.length,
        categoryCounts: Object.fromEntries(
          [...categoryCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
        ),
        supportPhaseCounts: Object.fromEntries(
          [...phaseCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
        ),
        fixtures: materialized,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
