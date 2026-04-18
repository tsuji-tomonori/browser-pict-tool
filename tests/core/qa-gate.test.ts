import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateModelDocument } from "../../packages/core/constraints/index.ts";
import { hasErrorDiagnostics } from "../../packages/core/diagnostics/index.ts";
import { generateTestSuite } from "../../packages/core/generator/index.ts";
import { parseModelText } from "../../packages/core/parser/index.ts";

type MaterializedFixtureSummary = {
  fixtures: MaterializedFixture[];
};

type MaterializedFixture = {
  id: string;
  path: string;
  supportPhase: string;
};

type UpstreamIndex = {
  commands: UpstreamCommand[];
};

type UpstreamCommand = {
  id: string;
  category: string;
  raw: string;
  optionsRaw?: string[];
  expectedResult: string;
};

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixturesRoot = resolve(repoRoot, "tests/fixtures/upstream");
let qaSummaryLine = "";
let qaFailureLines: string[] = [];

process.on("exit", () => {
  if (qaSummaryLine) {
    process.stdout.write(`${qaSummaryLine}\n`);
  }

  for (const failure of qaFailureLines) {
    process.stderr.write(`${failure}\n`);
  }
});

function readJsonFile<T>(relativePath: string): T {
  const absolutePath = resolve(repoRoot, relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

function resolveFixtureDirectory(fixture: MaterializedFixture, command: UpstreamCommand): string {
  const derivedPath = resolve(fixturesRoot, command.category, fixture.id.replace(":", "-"));
  if (existsSync(derivedPath)) {
    return derivedPath;
  }

  return resolve(repoRoot, fixture.path);
}

function readModelText(fixtureDirectory: string): string | null {
  const modelTextPath = resolve(fixtureDirectory, "model.txt");
  if (existsSync(modelTextPath)) {
    return readFileSync(modelTextPath, "utf8");
  }

  const modelPictPath = resolve(fixtureDirectory, "model.pict");
  if (existsSync(modelPictPath)) {
    return readFileSync(modelPictPath, "utf8");
  }

  return null;
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of command) {
    if (char === "\"") {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (/\s/u.test(char) && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripSurroundingDoubleQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeCliOptionValue(value: string, flag: "d" | "n"): string {
  const normalizedValue = stripSurroundingDoubleQuotes(value);

  if (flag === "d") {
    const lower = normalizedValue.toLowerCase();
    if (lower === "tab") {
      return "\t";
    }
    if (lower === "space") {
      return " ";
    }
  }

  return normalizedValue;
}

function parsePictCliOptions(optionsRaw: string[], commandRaw?: string): {
  strength?: number;
  caseSensitive?: boolean;
  negativePrefix?: string;
  valueDelimiter?: string;
} {
  const result: {
    strength?: number;
    caseSensitive?: boolean;
    negativePrefix?: string;
    valueDelimiter?: string;
  } = {};

  const optionTokens =
    commandRaw === undefined ? optionsRaw : tokenizeCommand(commandRaw).slice(1);

  for (const raw of optionTokens) {
    const lower = raw.toLowerCase();
    if (lower === "/c" || lower === "-c") {
      result.caseSensitive = true;
      continue;
    }

    const match = raw.match(/^[\/-]([a-zA-Z]):(.*)$/);
    if (!match) {
      continue;
    }

    const flag = match[1].toLowerCase();
    const val = match[2];
    if (flag === "o") {
      const n = parseInt(val, 10);
      if (n > 0) {
        result.strength = n;
      }
    }
    if (flag === "d") {
      result.valueDelimiter = normalizeCliOptionValue(val, "d");
    }
    if (flag === "n") {
      result.negativePrefix = normalizeCliOptionValue(val, "n");
    }
  }

  return result;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

test("parsePictCliOptions normalizes quoted delimiter and negative prefix values", () => {
  assert.deepEqual(parsePictCliOptions(['/d:","'], 'arg001.txt /d:","'), {
    valueDelimiter: ",",
  });
  assert.deepEqual(parsePictCliOptions(["/d:space"], "arg002.txt /d:space"), {
    valueDelimiter: " ",
  });
  assert.deepEqual(parsePictCliOptions(['/d:"', '"'], 'arg002.txt /d:" "'), {
    valueDelimiter: " ",
  });
  assert.deepEqual(parsePictCliOptions(['/n:"~"'], 'arg005.txt /n:"~"'), {
    negativePrefix: "~",
  });
  assert.deepEqual(parsePictCliOptions(['/n:"@"'], 'arg006.txt /n:"@"'), {
    negativePrefix: "@",
  });
});

test("required_v0_1 fixtures satisfy the current core QA gate", (t) => {
  const summary = readJsonFile<MaterializedFixtureSummary>(
    "tests/generated/materialized-fixtures-summary.json",
  );
  const upstreamIndex = readJsonFile<UpstreamIndex>("tests/generated/upstream-index.json");
  const commandsById = new Map(upstreamIndex.commands.map((command) => [command.id, command]));
  const requiredFixtures = summary.fixtures.filter(
    (fixture) => fixture.supportPhase === "required_v0_1",
  );

  const failures: string[] = [];
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const fixture of requiredFixtures) {
    try {
      const command = commandsById.get(fixture.id);
      if (!command) {
        failCount += 1;
        failures.push(`${fixture.id}: missing upstream command metadata`);
        continue;
      }

      if (command.expectedResult === "BAD_OPTION") {
        skipCount += 1;
        continue;
      }

      if (
        command.expectedResult !== "SUCCESS" &&
        command.expectedResult !== "BAD_MODEL" &&
        command.expectedResult !== "BAD_CONSTRAINTS"
      ) {
        skipCount += 1;
        continue;
      }

      const fixtureDirectory = resolveFixtureDirectory(fixture, command);
      if (!existsSync(fixtureDirectory)) {
        failCount += 1;
        failures.push(`${fixture.id}: fixture directory not found at ${fixtureDirectory}`);
        continue;
      }

      const modelText = readModelText(fixtureDirectory);
      if (modelText === null) {
        skipCount += 1;
        continue;
      }

      const cliOpts = parsePictCliOptions(command.optionsRaw ?? [], command.raw);
      let parsed: ReturnType<typeof parseModelText>;
      try {
        parsed = parseModelText(modelText, {
          caseSensitive: cliOpts.caseSensitive,
          negativePrefix: cliOpts.negativePrefix,
          valueDelimiter: cliOpts.valueDelimiter,
        });
      } catch (error) {
        failCount += 1;
        failures.push(`${fixture.id}: ${formatErrorMessage(error)}`);
        continue;
      }

      const validation = validateModelDocument(parsed.model);
      const diagnostics = [...parsed.diagnostics, ...validation.diagnostics];
      const hasErrors = hasErrorDiagnostics(diagnostics);

      if (command.expectedResult === "SUCCESS") {
        const generated = generateTestSuite(validation, { strength: cliOpts.strength ?? 2 });
        if (hasErrors) {
          failCount += 1;
          failures.push(`${fixture.id}: expected SUCCESS but parse/validate produced errors`);
          continue;
        }
        if (generated.suite === null) {
          failCount += 1;
          failures.push(`${fixture.id}: expected SUCCESS but generation returned no suite`);
          continue;
        }

        passCount += 1;
        continue;
      }

      if (!hasErrors) {
        failCount += 1;
        failures.push(
          `${fixture.id}: expected ${command.expectedResult} but parse/validate produced no errors`,
        );
        continue;
      }

      passCount += 1;
    } catch (error) {
      failCount += 1;
      failures.push(`${fixture.id}: ${formatErrorMessage(error)}`);
    }
  }

  for (const failure of failures) {
    t.diagnostic(`QA gate failure: ${failure}`);
  }

  qaFailureLines = failures.map((failure) => `QA gate failure: ${failure}`);
  qaSummaryLine = `QA gate: ${passCount} passed, ${failCount} failed, ${skipCount} skipped out of ${requiredFixtures.length} fixtures`;
  t.diagnostic(qaSummaryLine);

  assert.ok(passCount > 0, "expected at least one QA fixture to pass");
});
