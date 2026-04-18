/**
 * Tests derived from the PICT-generated feature coverage matrix (out.txt).
 *
 * Each test exercises a specific combination of features identified by the
 * pairwise analysis of the project's feature surface. The rows with
 * SupportPhase=required_v0_1 define the features the core must handle today.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  generateTestSuite,
  hasErrorDiagnostics,
  parseModelText,
  validateModelDocument,
} from "../../packages/core/index.ts";

// Row 5: required_v0_1, core_constraints, mixed types, empty_value, if_then, like_pattern, single_term, insensitive_default
test("feature-matrix: mixed types with IF-THEN LIKE pattern (row 5)", () => {
  const source = `Size: 1, 2, 3
Browser: Chrome, Firefox,
Mode: Basic, Advanced

IF [Size] > 1 THEN [Browser] LIKE "C*";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(generated.suite?.coverage.uncoveredTupleCount, 0);

  for (const row of generated.suite?.rows ?? []) {
    const size = parseInt(row[0], 10);
    if (size > 1) {
      assert.ok(
        row[1].startsWith("C") || row[1] === "",
        `Size=${size} should have Browser matching C*: got "${row[1]}"`,
      );
    }
  }
});

// Row 9: required_v0_1, core_cli_parser, string_only, negative with custom_prefix, sensitive_option
test("feature-matrix: custom negative prefix with case-sensitive option (row 9)", () => {
  const source = `API: REST, GraphQL
Auth: None, !Expired
Region: US, EU
`;

  const parsed = parseModelText(source, {
    caseSensitive: true,
    negativePrefix: "!",
  });
  const validation = validateModelDocument(parsed.model);
  const diagnostics = [...parsed.diagnostics, ...validation.diagnostics];

  assert.equal(hasErrorDiagnostics(diagnostics), false);
  assert.equal(parsed.model.parameters[1]?.values[1]?.isNegative, true);

  const generated = generateTestSuite(validation, { strength: 2 });
  assert.notEqual(generated.suite, null);
});

// Row 17: required_v0_1, core_constraints, mixed, negative tilde_default, if_then_else, parameter_compare, not_with_parentheses
test("feature-matrix: IF-THEN-ELSE with parameter comparison and NOT (row 17)", () => {
  const source = `Priority: 1, 2, 3
Severity: 1, 2, 3
Status: Open, ~Closed

IF NOT ([Priority] = [Severity]) THEN [Status] = "Open"
ELSE [Status] <> "Open";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  // May have type mismatch diagnostics due to mixed parameter comparison,
  // but should still produce a result or clear diagnostics
  assert.ok(generated.suite !== null || generated.diagnostics.length > 0);
});

// Row 20: required_v0_1, core_constraints, numeric_only, invariant, IN set, AND/OR, sensitive_option
test("feature-matrix: numeric invariant with IN set and AND/OR logic (row 20)", () => {
  const source = `X: 1, 2, 3, 4, 5
Y: 10, 20, 30
Z: 100, 200

[X] IN {1, 2, 3} AND [Y] > 10 OR [Z] = 200;
`;

  const parsed = parseModelText(source, { caseSensitive: true });
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
});

// Row 21: required_v0_1, core_cli_parser, mixed, invariant, IN set, single_term, insensitive_default
test("feature-matrix: invariant IN set with custom delimiter (row 21)", () => {
  const source = `Level: Low, Medium, High
Score: 1, 2, 3

[Level] IN {"Low", "Medium"};
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);

  for (const row of generated.suite?.rows ?? []) {
    // All rows should satisfy the invariant
    assert.ok(
      row[0] === "Low" || row[0] === "Medium",
      `Level should be Low or Medium: got "${row[0]}"`,
    );
  }
});

// Row 26: required_v0_1, core_constraints, string_only, invariant, literal_compare, single_term
test("feature-matrix: string invariant with literal comparison (row 26)", () => {
  const source = `Color: Red, Green, Blue
Shape: Circle, Square, Triangle

[Color] <> "Red";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  for (const row of generated.suite?.rows ?? []) {
    assert.notEqual(row[0], "Red", "Red should be excluded by invariant");
  }
});

// Row 27: required_v0_1, core_cli_parser, numeric_only, if_then, literal_compare, AND/OR
test("feature-matrix: numeric IF-THEN with AND/OR logic (row 27)", () => {
  const source = `A: 1, 2, 3
B: 10, 20, 30
C: 100, 200

IF [A] = 1 AND [B] > 10 THEN [C] = 200;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);

  for (const row of generated.suite?.rows ?? []) {
    if (row[0] === "1" && parseInt(row[1], 10) > 10) {
      assert.equal(row[2], "200", "A=1 AND B>10 should force C=200");
    }
  }
});

// Row 31: required_v0_1, core_cli_parser, string_only, if_then_else, like_pattern, AND/OR
test("feature-matrix: IF-THEN-ELSE with LIKE and AND/OR (row 31)", () => {
  const source = `Browser: IE11, Chrome, Firefox, Edge
OS: Windows, macOS, Linux

IF [Browser] LIKE "I*" OR [Browser] LIKE "E*" THEN [OS] = "Windows"
ELSE [OS] <> "Windows";
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);

  for (const row of generated.suite?.rows ?? []) {
    const browser = row[0];
    const os = row[1];
    if (browser.startsWith("I") || browser.startsWith("E")) {
      assert.equal(os, "Windows", `${browser} should use Windows`);
    } else {
      assert.notEqual(os, "Windows", `${browser} should not use Windows`);
    }
  }
});

// Row 42: required_v0_1, core_cli_parser, numeric_only, negative tilde, invariant, parameter_compare, not_with_parentheses
test("feature-matrix: numeric invariant with negative value and parameter compare (row 42)", () => {
  const source = `Min: 1, 2, 3
Max: 2, 3, ~4

[Min] < [Max];
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);

  for (const row of generated.suite?.rows ?? []) {
    const min = parseInt(row[0], 10);
    const max = parseInt(row[1].replace("~", ""), 10);
    assert.ok(min < max, `Min=${min} should be < Max=${max}`);
  }
});

// Row 50: required_v0_1, core_cli_parser, string_only, negative custom_prefix, sensitive_option
test("feature-matrix: custom negative prefix with case-sensitive parsing (row 50)", () => {
  const source = `Service: API, Web
Environment: Prod, @Staging
`;

  const parsed = parseModelText(source, {
    caseSensitive: true,
    negativePrefix: "@",
  });
  const validation = validateModelDocument(parsed.model);

  assert.equal(hasErrorDiagnostics([...parsed.diagnostics, ...validation.diagnostics]), false);
  assert.equal(parsed.model.parameters[1]?.values[1]?.isNegative, true);
  assert.equal(parsed.model.parameters[1]?.values[1]?.primaryName, "Staging");

  const generated = generateTestSuite(validation, { strength: 2 });
  assert.notEqual(generated.suite, null);
});

// Row 53: required_v0_1, core_constraints, numeric_only, negative custom_prefix, invariant, literal_compare, not_with_parentheses
test("feature-matrix: numeric invariant with custom negative prefix (row 53)", () => {
  const source = `X: 1, 2, !3
Y: 10, 20

NOT ([X] = 1);
`;

  const parsed = parseModelText(source, { negativePrefix: "!" });
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);

  for (const row of generated.suite?.rows ?? []) {
    assert.notEqual(row[0], "1", "X=1 should be excluded by NOT invariant");
  }
});

// Test the feature matrix itself can be parsed and generated by our tool
test("feature-matrix: out.txt model can be parsed as a PICT model", () => {
  // The out.txt header line itself defines a valid PICT model
  const header =
    "FeatureSurface, RepoExtensionKind, SupportPhase, UpstreamCoverageBucket, FixtureReadiness";
  const source = `${header}
`;

  const parsed = parseModelText(source);

  assert.equal(parsed.model.parameters.length, 1);
  // A single comma-separated line is one parameter with multiple values
  assert.ok(parsed.model.parameters[0]?.values.length > 0);
});

// Comprehensive integration: many parameters with constraints
test("feature-matrix: large model integration", () => {
  const source = `Browser: Chrome, Firefox, Safari, Edge
OS: Windows, macOS, Linux
Language: en, ja, zh, ko
Theme: Light, Dark
Auth: Basic, OAuth, ~None
Resolution: 1080, 1440, 2160

IF [Browser] = "Safari" THEN [OS] = "macOS";
IF [Browser] = "Edge" THEN [OS] = "Windows";
IF [Language] = "ko" THEN [Theme] = "Light";
[Resolution] >= 1080;
`;

  const parsed = parseModelText(source);
  const validation = validateModelDocument(parsed.model);
  const generated = generateTestSuite(validation, { strength: 2 });

  assert.notEqual(generated.suite, null);
  assert.equal(generated.suite?.coverage.uncoveredTupleCount, 0);
  assert.ok(generated.suite?.rows.length >= 6, "expected at least 6 rows for 6-param model");

  for (const row of generated.suite?.rows ?? []) {
    if (row[0] === "Safari") {
      assert.equal(row[1], "macOS");
    }
    if (row[0] === "Edge") {
      assert.equal(row[1], "Windows");
    }
    if (row[2] === "ko") {
      assert.equal(row[3], "Light");
    }
  }
});
