#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";

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

type CategorySummary = {
  category: string;
  artifactCount: number;
  commandCount: number;
  supportPhaseCounts: Record<SupportPhase, number>;
  supportPhaseHint: SupportPhase;
  rationale: string;
};

const expectedExitCodes: Record<ExpectedResult, number> = {
  SUCCESS: 0,
  OUT_OF_MEMORY: 1,
  GENERATION_ERROR: 2,
  BAD_OPTION: 3,
  BAD_MODEL: 4,
  BAD_CONSTRAINTS: 5,
  BAD_ROWSEED_FILE: 6,
};

const supportPhaseOrder: SupportPhase[] = [
  "required_v0_1",
  "deferred_v0_2",
  "deferred_v0_3",
  "repo_extension_non_goal",
  "reference_regression",
];

const supportRationale: Record<SupportPhase, string> = {
  required_v0_1:
    "RFC v0.1 のコア受け入れ範囲。parser / constraint / diagnostics の最低限の互換性をここで担保する。",
  deferred_v0_2:
    "公開仕様だが v0.1 では後回しにしている。aliases / parameter reuse / submodels などの段階導入対象。",
  deferred_v0_3:
    "公開仕様だが実装コストが高く後段導入に回す。weighting / seeding / randomize を含む。",
  repo_extension_non_goal:
    "upstream repo 実装では確認できるが、公開仕様として前提にしない。result parameter / function predicate / hidden CLI など。",
  reference_regression:
    "大きい実モデルや歴史的回帰の参照コーパス。v0.1 の acceptance gate ではなく後段の回帰観測に使う。",
};

function listCategoryDirs(testRoot: string): string[] {
  return readdirSync(testRoot)
    .map((name) => join(testRoot, name))
    .filter((fullPath) => statSync(fullPath).isDirectory())
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

function countArtifacts(categoryDir: string): number {
  return readdirSync(categoryDir).filter((name) => name.endsWith(".txt") || name.endsWith(".sed"))
    .length;
}

function categoryDefaultSupportPhase(category: string): SupportPhase {
  switch (category) {
    case "root":
    case "arg":
    case "cons":
    case "modl":
    case "para":
    case "prp":
    case "term":
      return "required_v0_1";
    case "clus":
      return "deferred_v0_2";
    case "seed":
    case "wght":
      return "deferred_v0_3";
    case "func":
      return "repo_extension_non_goal";
    case "bug":
    case "real":
    case "+real":
    case "+perf":
      return "reference_regression";
    default:
      return "reference_regression";
  }
}

function parseNotes(rawNotes: string | undefined): string[] {
  if (!rawNotes) return [];
  return rawNotes
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractFeatureTags(category: string, command: string, modelFile: string): string[] {
  const tags = new Set<string>();

  tags.add(`category:${category}`);

  if (/[/-]o:/i.test(command)) tags.add("option:order");
  if (/[/-]d:/i.test(command)) tags.add("option:value_delimiter");
  if (/[/-]a:/i.test(command)) tags.add("option:alias_delimiter");
  if (/[/-]n:/i.test(command)) tags.add("option:negative_prefix");
  if (/[/-]r(?::|\s|$)/i.test(command)) tags.add("option:randomize");
  if (/[/-]e:/i.test(command)) tags.add("option:seeding");
  if (/[/-]c(?::|\s|$)/i.test(command)) tags.add("option:case_sensitive");
  if (/[/-]s(?::|\s|$)/i.test(command)) tags.add("option:statistics");
  if (/[/-]f:/i.test(command)) tags.add("option:format_output");
  if (/[/-]p(?::|\s|$)/i.test(command)) tags.add("option:hidden_preview");
  if (/[/-]x(?::|\s|$)/i.test(command)) tags.add("option:hidden_approximate");
  if (/[/-]v(?::|\s|$)/i.test(command)) tags.add("option:hidden_verbose");

  switch (category) {
    case "arg":
    case "root":
      tags.add("area:cli");
      break;
    case "para":
      tags.add("area:parameter_definition");
      break;
    case "modl":
      tags.add("area:model_structure");
      break;
    case "cons":
      tags.add("area:constraints");
      break;
    case "prp":
      tags.add("area:parameter_compare");
      break;
    case "term":
      tags.add("area:predicate_terms");
      break;
    case "clus":
      tags.add("area:submodels");
      break;
    case "seed":
      tags.add("area:seeding");
      break;
    case "wght":
      tags.add("area:weighting");
      break;
    case "func":
      tags.add("area:function_predicate");
      break;
    case "bug":
      tags.add("area:bug_regression");
      break;
    case "real":
    case "+real":
      tags.add("area:real_models");
      break;
    case "+perf":
      tags.add("area:performance");
      break;
  }

  if (modelFile === "real201.txt") {
    tags.add("syntax:result_parameter");
  }

  return [...tags].sort();
}

function inferSupportPhase(category: string, command: string, modelFile: string): SupportPhase {
  if (
    /[/-]F:/i.test(command) ||
    /[/-]P(?::|\s|$)/i.test(command) ||
    /[/-]X(?::|\s|$)/i.test(command) ||
    /[/-]V(?::|\s|$)/i.test(command)
  ) {
    return "repo_extension_non_goal";
  }

  if (category === "func" || modelFile === "real201.txt") {
    return "repo_extension_non_goal";
  }

  if (category === "wght" || /[/-]E:/i.test(command) || /[/-]R(?::|\s|$)/i.test(command)) {
    return "deferred_v0_3";
  }

  if (category === "seed") {
    return "deferred_v0_3";
  }

  if (category === "clus") {
    return "deferred_v0_2";
  }

  if (/[/-]A:/i.test(command)) {
    return "deferred_v0_2";
  }

  if (category === "real" || category === "+real" || category === "+perf" || category === "bug") {
    return "reference_regression";
  }

  return "required_v0_1";
}

function parseTestsFile(testRoot: string, testsPath: string): CommandCase[] {
  const relativeDir = relative(testRoot, dirname(testsPath));
  const category = relativeDir === "" ? "root" : basename(relativeDir);
  const lines = readFileSync(testsPath, "utf8").split(/\r?\n/);
  const cases: CommandCase[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("->")) {
      return;
    }

    const match = trimmed.match(/^(.*?)\s*->\s*(\S+)(?:\s*\[(.*)\])?$/);
    if (!match) {
      return;
    }

    const [, commandPart, expectedResultRaw, notesRaw] = match;
    const tokens = commandPart.trim().split(/\s+/).filter(Boolean);
    const modelFile = tokens[0] ?? "";
    const optionsRaw = tokens.slice(1);
    const expectedResult = expectedResultRaw as ExpectedResult;
    const notes = parseNotes(notesRaw);
    const featureTags = extractFeatureTags(category, commandPart.trim(), modelFile);
    const supportPhase = inferSupportPhase(category, commandPart.trim(), modelFile);

    cases.push({
      id: `${category}:${String(cases.length + 1).padStart(3, "0")}`,
      category,
      raw: commandPart.trim(),
      modelFile,
      optionsRaw,
      expectedResult,
      expectedExitCode: expectedExitCodes[expectedResult],
      notes,
      featureTags,
      supportPhase,
      source: {
        testsPath: relative(process.cwd(), testsPath),
        lineNumber: index + 1,
      },
    });
  });

  return cases;
}

function summarizeByCategory(
  categoryDirs: string[],
  testRoot: string,
  cases: CommandCase[],
): CategorySummary[] {
  const syntheticRootDir = join(testRoot, ".");
  const dirs = [syntheticRootDir, ...categoryDirs];

  return dirs.map((categoryDir) => {
    const rel = relative(testRoot, categoryDir);
    const category = rel === "" ? "root" : basename(categoryDir);
    const categoryCases = cases.filter((item) => item.category === category);
    const supportPhaseCounts = Object.fromEntries(
      supportPhaseOrder.map((phase) => [
        phase,
        categoryCases.filter((item) => item.supportPhase === phase).length,
      ]),
    ) as Record<SupportPhase, number>;

    const supportPhaseHint = categoryDefaultSupportPhase(category);

    return {
      category,
      artifactCount: category === "root" ? 0 : countArtifacts(categoryDir),
      commandCount: categoryCases.length,
      supportPhaseCounts,
      supportPhaseHint,
      rationale: supportRationale[supportPhaseHint],
    };
  });
}

function main() {
  const repoRoot = process.cwd();
  const testRoot = join(repoRoot, ".work", "pict", "test");
  const generatedRoot = join(repoRoot, "tests", "generated");
  const categoryDirs = listCategoryDirs(testRoot);
  const testsFiles = [
    join(testRoot, ".tests"),
    ...categoryDirs.map((categoryDir) => join(categoryDir, ".tests")),
  ].filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });

  const cases = testsFiles.flatMap((testsPath) => parseTestsFile(testRoot, testsPath));
  const categories = summarizeByCategory(categoryDirs, testRoot, cases);
  const artifactsTotal = categories.reduce((sum, item) => sum + item.artifactCount, 0);
  const commandTotal = cases.length;

  const supportPhaseCounts = Object.fromEntries(
    supportPhaseOrder.map((phase) => [
      phase,
      cases.filter((item) => item.supportPhase === phase).length,
    ]),
  ) as Record<SupportPhase, number>;

  mkdirSync(generatedRoot, { recursive: true });

  const index = {
    generatedAt: new Date().toISOString(),
    sourceRoot: relative(repoRoot, testRoot),
    totals: {
      artifactFiles: artifactsTotal,
      commandCases: commandTotal,
      supportPhaseCounts,
    },
    categories,
    commands: cases,
  };

  const summary = {
    generatedAt: index.generatedAt,
    sourceRoot: index.sourceRoot,
    totals: index.totals,
    categories,
  };

  writeFileSync(join(generatedRoot, "upstream-index.json"), JSON.stringify(index, null, 2) + "\n");
  writeFileSync(
    join(generatedRoot, "upstream-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
}

main();
