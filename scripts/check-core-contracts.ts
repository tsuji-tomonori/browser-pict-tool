import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasErrorDiagnostics,
  normalizeParseOptions,
  parseModelText,
  validateModelDocument,
} from "../packages/core/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(rootDir, "packages/core");
const packageJsonPath = path.join(coreDir, "package.json");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  name?: string;
  type?: string;
  exports?: Record<string, string>;
};

const expectedExports = {
  ".": "./index.ts",
  "./parser": "./parser/index.ts",
  "./constraints": "./constraints/index.ts",
  "./model": "./model/index.ts",
  "./diagnostics": "./diagnostics/index.ts",
};

assert.equal(packageJson.name, "@browser-pict-tool/core");
assert.equal(packageJson.type, "module");
assert.deepEqual(packageJson.exports, expectedExports);

for (const target of Object.values(expectedExports)) {
  await access(path.join(coreDir, target.slice(2)));
}

const normalized = normalizeParseOptions({ negativePrefix: "~" });
assert.equal(normalized.negativePrefix, "~");

const parsed = parseModelText(`Browser: Chrome, Firefox
OS: Windows, macOS

IF [Browser] = "Chrome" THEN [OS] <> "macOS";
`);

assert.equal(parsed.model.parameters.length, 2);
assert.equal(parsed.model.constraints.length, 1);

const validation = validateModelDocument(parsed.model);
assert.equal(validation.parameters.length, 2);
assert.equal(validation.effectiveConstraints.length, 1);
assert.equal(hasErrorDiagnostics([...parsed.diagnostics, ...validation.diagnostics]), false);
